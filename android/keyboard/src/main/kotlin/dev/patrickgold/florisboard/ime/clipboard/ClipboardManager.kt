/*
 * Copyright (C) 2021-2025 The FlorisBoard Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package dev.patrickgold.florisboard.ime.clipboard

import android.content.ClipData
import android.content.Context
import dev.patrickgold.florisboard.app.FlorisPreferenceStore
import dev.patrickgold.florisboard.appContext
import dev.patrickgold.florisboard.editorInstance
import dev.patrickgold.florisboard.ime.clipboard.provider.ClipboardItem
import dev.patrickgold.florisboard.ime.clipboard.provider.ClipboardMediaProvider
import dev.patrickgold.florisboard.ime.clipboard.provider.ItemType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.florisboard.lib.android.AndroidClipboardManager
import org.florisboard.lib.android.AndroidClipboardManager_OnPrimaryClipChangedListener
import org.florisboard.lib.android.clearPrimaryClipAnyApi
import org.florisboard.lib.android.setOrClearPrimaryClip
import org.florisboard.lib.android.showShortToastSync
import org.florisboard.lib.android.systemService
import org.florisboard.lib.kotlin.tryOrNull
import java.io.Closeable

/**
 * [ClipboardManager] manages the clipboard and clipboard history.
 *
 * Also just going to document how all the classes here work.
 *
 * [ClipboardManager] handles storage and retrieval of clipboard items. All manipulation of the
 * clipboard goes through here.
 */
class ClipboardManager(
    context: Context,
) : AndroidClipboardManager_OnPrimaryClipChangedListener, Closeable {
    companion object {
        // 1 minute
        private const val INTERVAL = 60 * 1000L

        /**
         * Taken from ClipboardDescription.java from the AOSP
         *
         * Helper to compare two MIME types, where one may be a pattern.
         * @param concreteType A fully-specified MIME type.
         * @param desiredType A desired MIME type that may be a pattern such as * / *.
         * @return Returns true if the two MIME types match.
         */
        fun compareMimeTypes(concreteType: String, desiredType: String): Boolean {
            val typeLength = desiredType.length
            if (typeLength == 3 && desiredType == "*/*") {
                return true
            }
            val slashpos = desiredType.indexOf('/')
            if (slashpos > 0) {
                if (typeLength == slashpos + 2 && desiredType[slashpos + 1] == '*') {
                    if (desiredType.regionMatches(0, concreteType, 0, slashpos + 1)) {
                        return true
                    }
                } else if (desiredType == concreteType) {
                    return true
                }
            }
            return false
        }
    }

    private val prefs by FlorisPreferenceStore
    private val appContext by context.appContext()
    private val editorInstance by context.editorInstance()
    private val systemClipboardManager = context.systemService(AndroidClipboardManager::class)

    private val ioScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var cleanUpJob: Job

    // Local change: history lives only in this process. The upstream Room schema is kept in
    // ClipboardDatabase.kt for provenance, but this manager never opens or writes to it.
    private val inMemoryHistory = mutableListOf<ClipboardItem>()
    private var nextInMemoryId = 1L

    private val _historyFlow = MutableStateFlow(ClipboardHistory.EMPTY)
    val historyFlow = _historyFlow.asStateFlow()
    val currentHistory: ClipboardHistory
        get() = historyFlow.value

    private val primaryClipLastFromCallbackGuard = Mutex(locked = false)
    private var primaryClipLastFromCallback: ClipData? = null
    private val _primaryClipFlow = MutableStateFlow<ClipboardItem?>(null)
    val primaryClipFlow = _primaryClipFlow.asStateFlow()
    inline var primaryClip
        get() = primaryClipFlow.value
        private set(v) {
            _primaryClipFlow.value = v
        }

    init {
        systemClipboardManager.addPrimaryClipChangedListener(this)
        cleanUpJob = ioScope.launch {
            while (isActive) {
                delay(INTERVAL)
                enforceExpiryDate()
            }
        }
    }

    fun initializeForContext(@Suppress("UNUSED_PARAMETER") context: Context) {
        // Local change: no Room database is opened. Clips collected while the IME process is
        // alive stay in inMemoryHistory and disappear when the process dies.
    }

    private fun publishHistory() {
        val items = synchronized(inMemoryHistory) { inMemoryHistory.toList() }
        _historyFlow.value = ClipboardHistory(items.sortedByDescending { it.creationTimestampMs })
    }

    /**
     * Sets the current primary clip without updating the internal clipboard history.
     */
    fun updatePrimaryClip(item: ClipboardItem?) {
        primaryClip = item
        if (prefs.clipboard.useInternalClipboard.get()) {
            val syncBehavior = prefs.clipboard.syncToSystem.get()
            val clipData = item?.toClipData(appContext)
            if (clipData != null && syncBehavior.shouldSyncSet) {
                systemClipboardManager.setPrimaryClip(clipData)
            } else if (clipData == null && syncBehavior.shouldSyncClear) {
                systemClipboardManager.clearPrimaryClipAnyApi()
            }
        } else {
            systemClipboardManager.setOrClearPrimaryClip(item?.toClipData(appContext))
        }
    }

    /**
     * Called by system clipboard when the system primary clip has changed.
     */
    override fun onPrimaryClipChanged() {
        val syncBehavior = prefs.clipboard.syncToFloris.get()
        if (!prefs.clipboard.useInternalClipboard.get() || syncBehavior != ClipboardSyncBehavior.NO_EVENTS) {
            val systemPrimaryClip = systemClipboardManager.primaryClip
            ioScope.launch {
                val isDuplicate: Boolean
                primaryClipLastFromCallbackGuard.withLock {
                    val a = primaryClipLastFromCallback?.getItemAt(0)
                    val b = systemPrimaryClip?.getItemAt(0)
                    isDuplicate = when {
                        a === b -> true
                        a == null || b == null -> false
                        else -> a.text == b.text && a.uri == b.uri
                    }
                    primaryClipLastFromCallback = systemPrimaryClip
                }
                if (isDuplicate) return@launch

                val internalPrimaryClip = primaryClip

                if (systemPrimaryClip == null) {
                    if (syncBehavior.shouldSyncClear) {
                        primaryClip = null
                    }
                    return@launch
                }

                if (systemPrimaryClip.getItemAt(0).let { it.text == null && it.uri == null }) {
                    if (syncBehavior.shouldSyncClear) {
                        primaryClip = null
                    }
                    return@launch
                }

                if (!syncBehavior.shouldSyncSet) {
                    return@launch
                }

                val isEqual = internalPrimaryClip?.isEqualTo(systemPrimaryClip) == true
                if (!isEqual) {
                    // Local change: cloneUri=false keeps media references in memory only;
                    // the upstream path copied media files into app storage.
                    val item = ClipboardItem.fromClipData(appContext, systemPrimaryClip, cloneUri = false)
                    primaryClip = item
                    insertOrMoveBeginning(item)
                }
            }
        }
    }

    /**
     * Change the current text on clipboard, update history (if enabled).
     */
    private fun addNewClip(item: ClipboardItem) {
        insertOrMoveBeginning(item)
        updatePrimaryClip(item)
    }

    /**
     * Wraps some plaintext in a ClipData and calls [addNewClip]
     */
    fun addNewPlaintext(newText: String) {
        val newData = ClipboardItem.text(newText)
        addNewClip(newData)
    }

    /**
     * Adds a new item to the clipboard history (if enabled).
     */
    private fun insertOrMoveBeginning(newItem: ClipboardItem) {
        if (!prefs.clipboard.historyEnabled.get()) return
        val historyElement = synchronized(inMemoryHistory) {
            inMemoryHistory.firstOrNull { it.type == ItemType.TEXT && it.text == newItem.text }
        }
        if (historyElement != null) {
            moveToTheBeginning(
                oldItem = historyElement,
                newItem = if (historyElement.isPinned) {
                    newItem.copy(isPinned = true)
                } else {
                    newItem
                }
            )
        } else {
            insertClip(newItem)
        }
    }

    private fun enforceHistoryLimit() {
        if (!prefs.clipboard.historySizeLimitEnabled.get()) return
        val limit = prefs.clipboard.historySizeLimit.get()
        synchronized(inMemoryHistory) {
            val nonPinnedItems = inMemoryHistory.filter { !it.isPinned }
                .sortedByDescending { it.creationTimestampMs }
            if (nonPinnedItems.size > limit) {
                val idsToRemove = nonPinnedItems.drop(limit).map { it.id }.toSet()
                inMemoryHistory.removeAll { it.id in idsToRemove }
            }
        }
    }

    private fun enforceExpiryDate() {
        val items = synchronized(inMemoryHistory) { inMemoryHistory.toList() }
        val idsToRemove = mutableSetOf<Long>()
        if (prefs.clipboard.historyAutoCleanOldEnabled.get()) {
            val expiryTime = System.currentTimeMillis() - (prefs.clipboard.historyAutoCleanOldAfter.get() * 60 * 1000)
            items.filter { !it.isPinned && it.creationTimestampMs < expiryTime }
                .forEach { idsToRemove.add(it.id) }
        }
        if (prefs.clipboard.historyAutoCleanSensitiveEnabled.get()) {
            val expiryTime = System.currentTimeMillis() - (prefs.clipboard.historyAutoCleanSensitiveAfter.get() * 1000)
            items.filter { it.isSensitive && it.creationTimestampMs < expiryTime }
                .forEach { idsToRemove.add(it.id) }
        }
        if (idsToRemove.isNotEmpty()) {
            synchronized(inMemoryHistory) { inMemoryHistory.removeAll { it.id in idsToRemove } }
            publishHistory()
        }
    }

    private fun moveToTheBeginning(oldItem: ClipboardItem, newItem: ClipboardItem) {
        synchronized(inMemoryHistory) {
            inMemoryHistory.removeAll { it.id == oldItem.id }
            newItem.id = nextInMemoryId++
            inMemoryHistory.add(newItem)
        }
        enforceHistoryLimit()
        publishHistory()
    }

    fun insertClip(item: ClipboardItem) {
        synchronized(inMemoryHistory) {
            item.id = nextInMemoryId++
            inMemoryHistory.add(item)
        }
        enforceHistoryLimit()
        publishHistory()
    }

    fun clearExactHistory(items: List<ClipboardItem>) {
        ioScope.launch {
            val ids = items.map { it.id }.toSet()
            for (item in items) {
                item.close(appContext)
            }
            synchronized(inMemoryHistory) { inMemoryHistory.removeAll { it.id in ids } }
            publishHistory()
        }
    }

    /**
     * Clears all unpinned items from the clipboard history
     */
    fun clearHistory() {
        ioScope.launch {
            val items = synchronized(inMemoryHistory) { inMemoryHistory.filter { !it.isPinned } }
            for (item in items) {
                item.close(appContext)
            }
            synchronized(inMemoryHistory) { inMemoryHistory.removeAll { !it.isPinned } }
            publishHistory()
        }
    }

    /**
     * Clears the full clipboard history
     */
    fun clearFullHistory() {
        ioScope.launch {
            val items = synchronized(inMemoryHistory) { inMemoryHistory.toList() }
            for (item in items) {
                item.close(appContext)
            }
            synchronized(inMemoryHistory) { inMemoryHistory.clear() }
            publishHistory()
        }
    }


    /**
     * Restore the clipboard history from a [List]
     *
     * @param items the [ClipboardItem] list with the new items
     */
    fun restoreHistory(items: List<ClipboardItem>) {
        ioScope.launch {
            val existing = synchronized(inMemoryHistory) {
                inMemoryHistory.map { it.copy(id = 0) }
            }
            synchronized(inMemoryHistory) {
                for (item in items) {
                    if (!existing.contains(item.copy(id = 0))) {
                        item.id = nextInMemoryId++
                        inMemoryHistory.add(item)
                    }
                }
            }
            publishHistory()
        }
    }

    fun deleteClip(item: ClipboardItem, onlyIfUnpinned: Boolean) {
        ioScope.launch {
            synchronized(inMemoryHistory) {
                inMemoryHistory.removeAll { it.id == item.id && (!onlyIfUnpinned || !it.isPinned) }
            }
            tryOrNull {
                val uri = item.uri
                if (uri?.authority == ClipboardMediaProvider.AUTHORITY) {
                    appContext.contentResolver.delete(uri, null, null)
                }
            }
            publishHistory()
        }
    }

    fun pinClip(item: ClipboardItem) {
        setPinned(item, true)
    }

    fun unpinClip(item: ClipboardItem) {
        setPinned(item, false)
    }

    private fun setPinned(item: ClipboardItem, isPinned: Boolean) {
        ioScope.launch {
            synchronized(inMemoryHistory) {
                val index = inMemoryHistory.indexOfFirst { it.id == item.id }
                if (index >= 0) {
                    inMemoryHistory[index] = inMemoryHistory[index].copy(isPinned = isPinned)
                }
            }
            publishHistory()
        }
    }

    fun pasteItem(item: ClipboardItem) {
        val editorInstance by appContext.editorInstance()
        editorInstance.commitClipboardItem(item).also { result ->
            if (!result) {
                appContext.showShortToastSync("Failed to paste item.")
            }
        }
    }

    /**
     * Returns true if the editor can accept the clip item, else false.
     */
    fun canBePasted(clipItem: ClipboardItem?): Boolean {
        if (clipItem == null) return false

        return clipItem.mimeTypes.contains("text/plain") || editorInstance.activeInfo.contentMimeTypes.any { editorType ->
            clipItem.mimeTypes.any { clipType ->
                compareMimeTypes(clipType, editorType)
            }
        }
    }

    /**
     * Cleans up.
     *
     * Unregisters the system clipboard listener, cancels clipboard clean ups.
     */
    override fun close() {
        systemClipboardManager.removePrimaryClipChangedListener(this)
        cleanUpJob.cancel()
    }
}
