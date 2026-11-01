package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.shared.CurrencySymbols
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The account's currency (#653), the app's half of
 * `frontend/ui/spendtrack/currency-selector.tsx`.
 *
 * The site's control shows the symbol and the currency's name and offers the
 * currencies the expense form accepts; so does this one, from the generated table
 * both clients read (`CurrencySymbols`, generated from `shared/currency.ts`), so
 * an Arabic name is neither retyped nor translated twice.
 *
 * Choosing one is a request, not a queued write: a currency that arrived a day
 * late would relabel history. The caller decides what an offline attempt says.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpendtrackCurrencyPicker(
    currency: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val selected = currency?.takeIf { CurrencySymbols.byCode.containsKey(it) }
        ?: CurrencySymbols.DEFAULT
    val info = CurrencySymbols.byCode[selected]
    val label = SpendtrackCurrencyCopy.LABEL

    ExposedDropdownMenuBox(
        expanded = open,
        onExpandedChange = { open = it },
        modifier = modifier,
    ) {
        OutlinedTextField(
            value =
                SpendtrackCurrencyCopy.CURRENT.replace(
                    "{name}",
                    info?.name ?: selected,
                ),
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            textStyle = androidx.compose.material3.MaterialTheme.typography.bodySmall,
            keyboardOptions = KeyboardOptions.Default,
            leadingIcon = {
                Icon(
                    imageVector = LucideVectors.Coins,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            },
            modifier =
                Modifier.fillMaxWidth()
                    .semantics { contentDescription = label }
                    .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (code in CurrencySymbols.expenseCodes) {
                val item = CurrencySymbols.byCode[code] ?: continue
                DropdownMenuItem(
                    text = {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(item.symbol)
                            Text(item.name)
                        }
                    },
                    onClick = {
                        open = false
                        if (code != selected) onSelect(code)
                    },
                )
            }
        }
    }
}
