"""
Al-Mudeer - Enhanced Database Models
Email & Telegram Integration for Superhuman Mode
Supports both SQLite (development) and PostgreSQL (production)
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any
import json

# Database configuration
DB_TYPE = os.getenv("DB_TYPE", "sqlite").lower()
DATABASE_PATH = os.getenv("DATABASE_PATH", "almudeer.db")
DATABASE_URL = os.getenv("DATABASE_URL")

# Import appropriate database driver
if DB_TYPE == "postgresql":
    try:
        import asyncpg
        POSTGRES_AVAILABLE = True
        aiosqlite = None
    except ImportError:
        raise ImportError(
            "PostgreSQL selected but asyncpg not installed. "
            "Install with: pip install asyncpg"
        )
else:
    import aiosqlite
    POSTGRES_AVAILABLE = False
    asyncpg = None


import sys
from pathlib import Path

# Add products/almudeer/backend to path for imports
backend_path = Path(__file__).parent.parent / "products" / "almudeer" / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

try:
    from db_helper import get_db, execute_sql, fetch_all, fetch_one, commit_db, DB_TYPE  # type: ignore
except ImportError:
    # Fallback: try importing from current directory
    try:
        import db_helper  # type: ignore
        get_db = db_helper.get_db
        execute_sql = db_helper.execute_sql
        fetch_all = db_helper.fetch_all
        fetch_one = db_helper.fetch_one
        commit_db = db_helper.commit_db
        DB_TYPE = db_helper.DB_TYPE
    except ImportError:
        raise ImportError("db_helper module not found. Please ensure it's in the Python path.")


# Helpers to generate SQL that works on both SQLite and PostgreSQL
ID_PK = "SERIAL PRIMARY KEY" if DB_TYPE == "postgresql" else "INTEGER PRIMARY KEY AUTOINCREMENT"
TIMESTAMP_NOW = "TIMESTAMP DEFAULT NOW()" if DB_TYPE == "postgresql" else "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"


async def init_enhanced_tables():
    """Initialize enhanced tables for Email & Telegram integration"""
    async with get_db() as db:
        
        # Email Configuration per license (OAuth 2.0 for Gmail)
        await execute_sql(db, """
            CREATE TABLE IF NOT EXISTS email_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key_id INTEGER UNIQUE NOT NULL,
                email_address TEXT NOT NULL,
                imap_server TEXT NOT NULL,
                imap_port INTEGER DEFAULT 993,
                smtp_server TEXT NOT NULL,
                smtp_port INTEGER DEFAULT 587,
                -- OAuth 2.0 tokens (for Gmail)
                access_token_encrypted TEXT,
                refresh_token_encrypted TEXT,
                token_expires_at TIMESTAMP,
                -- Legacy password field (deprecated, kept for migration)
                password_encrypted TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                auto_reply_enabled BOOLEAN DEFAULT FALSE,
                check_interval_minutes INTEGER DEFAULT 5,
                last_checked_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)
        
        # Add OAuth columns if they don't exist (migration for existing databases)
        try:
            await execute_sql(db, """
                ALTER TABLE email_configs ADD COLUMN access_token_encrypted TEXT
            """)
        except:
            pass  # Column already exists
        
        try:
            await execute_sql(db, """
                ALTER TABLE email_configs ADD COLUMN refresh_token_encrypted TEXT
            """)
        except:
            pass  # Column already exists
        
        try:
            await execute_sql(db, """
                ALTER TABLE email_configs ADD COLUMN token_expires_at TIMESTAMP
            """)
        except:
            pass  # Column already exists
        
        # Telegram Bot Configuration per license
        await execute_sql(db, """
            CREATE TABLE IF NOT EXISTS telegram_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key_id INTEGER UNIQUE NOT NULL,
                bot_token TEXT NOT NULL,
                bot_username TEXT,
                webhook_secret TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                auto_reply_enabled BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)
        
        # Unified Inbox - All incoming messages
        await execute_sql(db, """
            CREATE TABLE IF NOT EXISTS inbox_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key_id INTEGER NOT NULL,
                channel TEXT NOT NULL,
                channel_message_id TEXT,
                sender_id TEXT,
                sender_name TEXT,
                sender_contact TEXT,
                subject TEXT,
                body TEXT NOT NULL,
                received_at TIMESTAMP,
                intent TEXT,
                urgency TEXT,
                sentiment TEXT,
                ai_summary TEXT,
                ai_draft_response TEXT,
                status TEXT DEFAULT 'pending',
                processed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)
        
        # Outbox - Approved/Sent messages
        await execute_sql(db, """
            CREATE TABLE IF NOT EXISTS outbox_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                inbox_message_id INTEGER NOT NULL,
                license_key_id INTEGER NOT NULL,
                channel TEXT NOT NULL,
                recipient_id TEXT,
                recipient_email TEXT,
                subject TEXT,
                body TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                approved_at TIMESTAMP,
                sent_at TIMESTAMP,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (inbox_message_id) REFERENCES inbox_messages(id),
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)
        
        # Telegram Phone Sessions (MTProto for user accounts)
        await execute_sql(db, """
            CREATE TABLE IF NOT EXISTS telegram_phone_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key_id INTEGER UNIQUE NOT NULL,
                phone_number TEXT NOT NULL,
                session_data_encrypted TEXT NOT NULL,
                user_id TEXT,
                user_first_name TEXT,
                user_last_name TEXT,
                user_username TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                last_synced_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)
        
        # Telegram Chat Sessions
        await execute_sql(db, """
            CREATE TABLE IF NOT EXISTS telegram_chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key_id INTEGER NOT NULL,
                chat_id TEXT NOT NULL,
                chat_type TEXT,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                is_blocked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id),
                UNIQUE(license_key_id, chat_id)
            )
        """)
        
        # Performance indexes for frequent queries
        await execute_sql(db, """
            CREATE INDEX IF NOT EXISTS idx_inbox_license_status
            ON inbox_messages(license_key_id, status)
        """)
        await execute_sql(db, """
            CREATE INDEX IF NOT EXISTS idx_inbox_license_created
            ON inbox_messages(license_key_id, created_at)
        """)
        await execute_sql(db, """
            CREATE INDEX IF NOT EXISTS idx_outbox_license_status
            ON outbox_messages(license_key_id, status)
        """)

        await commit_db(db)
        print("Enhanced tables initialized")


# ============ Email Config Functions ============

async def save_email_config(
    license_id: int,
    email_address: str,
    access_token: str = None,
    refresh_token: str = None,
    token_expires_at: datetime = None,
    imap_server: str = "imap.gmail.com",
    smtp_server: str = "smtp.gmail.com",
    imap_port: int = 993,
    smtp_port: int = 587,
    auto_reply: bool = False,
    check_interval: int = 5
) -> int:
    """Save or update email configuration with OAuth 2.0 tokens (Gmail only)."""
    from db_helper import DB_TYPE  # type: ignore

    # Encrypt OAuth tokens
    encrypted_access_token = simple_encrypt(access_token) if access_token else None
    encrypted_refresh_token = simple_encrypt(refresh_token) if refresh_token else None

    # For PostgreSQL (asyncpg), pass a real datetime object.
    # For SQLite, store ISO string for readability/backward compatibility.
    if token_expires_at:
        # Normalize to naive UTC datetime for PostgreSQL, ISO for SQLite
        if token_expires_at.tzinfo is not None:
            token_expires_at = token_expires_at.astimezone(timezone.utc).replace(tzinfo=None)
        if DB_TYPE == "postgresql":
            expires_value = token_expires_at
        else:
            expires_value = token_expires_at.isoformat()
    else:
        expires_value = None

    async with get_db() as db:
        # Check if config exists
        existing = await fetch_one(
            db,
            "SELECT id FROM email_configs WHERE license_key_id = ?",
            [license_id],
        )

        if existing:
            await execute_sql(
                db,
                """
                UPDATE email_configs SET
                    email_address = ?, imap_server = ?, imap_port = ?,
                    smtp_server = ?, smtp_port = ?,
                    access_token_encrypted = ?, refresh_token_encrypted = ?,
                    token_expires_at = ?,
                    password_encrypted = ?,
                    auto_reply_enabled = ?, check_interval_minutes = ?
                WHERE license_key_id = ?
                """,
                [
                    email_address,
                    imap_server,
                    imap_port,
                    smtp_server,
                    smtp_port,
                    encrypted_access_token,
                    encrypted_refresh_token,
                    expires_value,
                    "",  # Empty string for OAuth (legacy password field)
                    auto_reply,
                    check_interval,
                    license_id,
                ],
            )
            await commit_db(db)
            return existing["id"]

        await execute_sql(
            db,
            """
            INSERT INTO email_configs 
                (license_key_id, email_address, imap_server, imap_port,
                 smtp_server, smtp_port, access_token_encrypted, refresh_token_encrypted,
                 token_expires_at, password_encrypted, auto_reply_enabled, check_interval_minutes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                license_id,
                email_address,
                imap_server,
                imap_port,
                smtp_server,
                smtp_port,
                encrypted_access_token,
                encrypted_refresh_token,
                expires_value,
                "",  # Empty string for OAuth (legacy password field)
                auto_reply,
                check_interval,
            ],
        )
        row = await fetch_one(
            db,
            """
            SELECT id FROM email_configs
            WHERE license_key_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            [license_id],
        )
        await commit_db(db)
        return row["id"] if row else 0


async def get_email_config(license_id: int) -> Optional[dict]:
    """Get email configuration for a license (SQLite & PostgreSQL compatible)."""
    async with get_db() as db:
        row = await fetch_one(
            db,
            "SELECT * FROM email_configs WHERE license_key_id = ?",
            [license_id],
        )
        if row:
            # Don't return encrypted tokens
            row.pop("access_token_encrypted", None)
            row.pop("refresh_token_encrypted", None)
            row.pop("password_encrypted", None)  # Legacy field
        return row


async def get_email_oauth_tokens(license_id: int) -> Optional[dict]:
    """Get decrypted OAuth tokens for email (internal use only)."""
    async with get_db() as db:
        row = await fetch_one(
            db,
            """SELECT access_token_encrypted, refresh_token_encrypted, token_expires_at
               FROM email_configs WHERE license_key_id = ?""",
            [license_id],
        )
        if row:
            result = {}
            if row.get("access_token_encrypted"):
                result["access_token"] = simple_decrypt(row["access_token_encrypted"])
            if row.get("refresh_token_encrypted"):
                result["refresh_token"] = simple_decrypt(row["refresh_token_encrypted"])
            if row.get("token_expires_at"):
                result["token_expires_at"] = row["token_expires_at"]
            return result if result else None
    return None


async def update_email_config_settings(
    license_id: int,
    auto_reply: bool = None,
    check_interval: int = None
) -> bool:
    """Update email configuration settings without changing tokens"""
    async with get_db() as db:
        updates = []
        params = []
        
        if auto_reply is not None:
            updates.append("auto_reply_enabled = ?")
            params.append(auto_reply)
        
        if check_interval is not None:
            updates.append("check_interval_minutes = ?")
            params.append(check_interval)
        
        if not updates:
            return False
        
        params.append(license_id)
        query = f"UPDATE email_configs SET {', '.join(updates)} WHERE license_key_id = ?"
        
        await execute_sql(db, query, params)
        await commit_db(db)
        return True


# Deprecated - kept for backward compatibility
async def get_email_password(license_id: int) -> Optional[str]:
    """Get decrypted email password (deprecated - use OAuth tokens instead)."""
    async with get_db() as db:
        row = await fetch_one(
            db,
            "SELECT password_encrypted FROM email_configs WHERE license_key_id = ?",
            [license_id],
        )
        if row and row.get("password_encrypted"):
            return simple_decrypt(row["password_encrypted"])
    return None


# ============ Telegram Config Functions ============

async def save_telegram_config(
    license_id: int,
    bot_token: str,
    bot_username: str = None,
    auto_reply: bool = False
) -> int:
    """Save or update Telegram bot configuration (SQLite & PostgreSQL compatible)."""
    import secrets
    webhook_secret = secrets.token_hex(16)

    async with get_db() as db:
        existing = await fetch_one(
            db,
            "SELECT id FROM telegram_configs WHERE license_key_id = ?",
            [license_id],
        )

        if existing:
            await execute_sql(
                db,
                """
                UPDATE telegram_configs SET
                    bot_token = ?, bot_username = ?, auto_reply_enabled = ?
                WHERE license_key_id = ?
                """,
                [bot_token, bot_username, auto_reply, license_id],
            )
            await commit_db(db)
            return existing["id"]

        await execute_sql(
            db,
            """
            INSERT INTO telegram_configs 
                (license_key_id, bot_token, bot_username, webhook_secret, auto_reply_enabled)
            VALUES (?, ?, ?, ?, ?)
            """,
            [license_id, bot_token, bot_username, webhook_secret, auto_reply],
        )
        row = await fetch_one(
            db,
            """
            SELECT id FROM telegram_configs
            WHERE license_key_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            [license_id],
        )
        await commit_db(db)
        return row["id"] if row else 0


async def get_telegram_config(license_id: int) -> Optional[dict]:
    """Get Telegram configuration for a license (SQLite & PostgreSQL compatible)."""
    async with get_db() as db:
        config = await fetch_one(
            db,
            "SELECT * FROM telegram_configs WHERE license_key_id = ?",
            [license_id],
        )
        if config and config.get("bot_token"):
            token = config["bot_token"]
            config["bot_token_masked"] = token[:10] + "..." + token[-5:]
            config.pop("bot_token", None)
        return config


# ============ Telegram Phone Sessions Functions ============

async def save_telegram_phone_session(
    license_id: int,
    phone_number: str,
    session_string: str,
    user_id: str = None,
    user_first_name: str = None,
    user_last_name: str = None,
    user_username: str = None
) -> int:
    """Save or update Telegram phone session (MTProto)."""
    # Encrypt session data
    encrypted_session = simple_encrypt(session_string)
    
    async with get_db() as db:
        # Check if session exists
        existing = await fetch_one(
            db,
            "SELECT id FROM telegram_phone_sessions WHERE license_key_id = ?",
            [license_id],
        )
        
        from db_helper import DB_TYPE  # type: ignore
        now = datetime.now() if DB_TYPE == "postgresql" else datetime.now().isoformat()
        
        if existing:
            await execute_sql(
                db,
                """
                UPDATE telegram_phone_sessions SET
                    phone_number = ?,
                    session_data_encrypted = ?,
                    user_id = ?,
                    user_first_name = ?,
                    user_last_name = ?,
                    user_username = ?,
                    is_active = TRUE,
                    updated_at = ?
                WHERE license_key_id = ?
                """,
                [
                    phone_number,
                    encrypted_session,
                    user_id,
                    user_first_name,
                    user_last_name,
                    user_username,
                    now,
                    license_id,
                ],
            )
            await commit_db(db)
            return existing["id"]
        
        await execute_sql(
            db,
            """
            INSERT INTO telegram_phone_sessions 
                (license_key_id, phone_number, session_data_encrypted,
                 user_id, user_first_name, user_last_name, user_username, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)
            """,
            [
                license_id,
                phone_number,
                encrypted_session,
                user_id,
                user_first_name,
                user_last_name,
                user_username,
                now,
                now,
            ],
        )
        row = await fetch_one(
            db,
            """
            SELECT id FROM telegram_phone_sessions
            WHERE license_key_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            [license_id],
        )
        await commit_db(db)
        return row["id"] if row else 0


async def get_telegram_phone_session(license_id: int) -> Optional[dict]:
    """Get Telegram phone session for a license (without decrypted session data)."""
    async with get_db() as db:
        row = await fetch_one(
            db,
            "SELECT * FROM telegram_phone_sessions WHERE license_key_id = ? AND is_active = TRUE",
            [license_id],
        )
        if row:
            # Don't return encrypted session data
            row.pop("session_data_encrypted", None)
            # Mask phone number for display
            if row.get("phone_number"):
                phone = row["phone_number"]
                if len(phone) > 6:
                    row["phone_number_masked"] = phone[:3] + "***" + phone[-3:]
        return row


async def get_telegram_phone_session_data(license_id: int) -> Optional[str]:
    """Get decrypted Telegram phone session string (internal use only)."""
    async with get_db() as db:
        row = await fetch_one(
            db,
            "SELECT session_data_encrypted FROM telegram_phone_sessions WHERE license_key_id = ? AND is_active = TRUE",
            [license_id],
        )
        if row and row.get("session_data_encrypted"):
            return simple_decrypt(row["session_data_encrypted"])
    return None


async def deactivate_telegram_phone_session(license_id: int) -> bool:
    """Deactivate Telegram phone session."""
    async with get_db() as db:
        await execute_sql(
            db,
            "UPDATE telegram_phone_sessions SET is_active = FALSE WHERE license_key_id = ?",
            [license_id],
        )
        await commit_db(db)
        return True


async def update_telegram_phone_session_sync_time(license_id: int) -> bool:
    """Update last_synced_at timestamp."""
    from db_helper import DB_TYPE  # type: ignore
    now = datetime.now() if DB_TYPE == "postgresql" else datetime.now().isoformat()
    
    async with get_db() as db:
        await execute_sql(
            db,
            "UPDATE telegram_phone_sessions SET last_synced_at = ? WHERE license_key_id = ?",
            [now, license_id],
        )
        await commit_db(db)
        return True


async def get_whatsapp_config(license_id: int) -> Optional[dict]:
    """Get WhatsApp configuration for a license (SQLite & PostgreSQL compatible)."""
    async with get_db() as db:
        config = await fetch_one(
            db,
            "SELECT * FROM whatsapp_configs WHERE license_key_id = ? AND is_active = 1",
            [license_id],
        )
        if config and config.get("access_token"):
            token = config["access_token"]
            config["access_token_masked"] = (
                token[:10] + "..." + token[-5:] if len(token) > 15 else "***"
            )
        return config


# ============ Inbox Functions ============

async def save_inbox_message(
    license_id: int,
    channel: str,
    body: str,
    sender_name: str = None,
    sender_contact: str = None,
    sender_id: str = None,
    subject: str = None,
    channel_message_id: str = None,
    received_at: datetime = None
) -> int:
    """Save incoming message to inbox (SQLite & PostgreSQL compatible)."""
    from db_helper import DB_TYPE  # type: ignore  # local import to avoid circulars

    # Normalize received_at to a UTC datetime; asyncpg prefers naive UTC
    if isinstance(received_at, str):
        try:
            received = datetime.fromisoformat(received_at)
        except ValueError:
            received = datetime.utcnow()
    elif isinstance(received_at, datetime):
        received = received_at
    else:
        received = datetime.utcnow()

    if received.tzinfo is not None:
        received = received.astimezone(timezone.utc).replace(tzinfo=None)

    # For PostgreSQL (asyncpg), pass a naive UTC datetime.
    # For SQLite, use ISO string.
    ts_value: Any
    if DB_TYPE == "postgresql":
        ts_value = received
    else:
        ts_value = received.isoformat()

    async with get_db() as db:
        await execute_sql(
            db,
            """
            INSERT INTO inbox_messages 
                (license_key_id, channel, channel_message_id, sender_id, sender_name,
                 sender_contact, subject, body, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                license_id,
                channel,
                channel_message_id,
                sender_id,
                sender_name,
                sender_contact,
                subject,
                body,
                ts_value,
            ],
        )

        # Fetch the last inserted id in a DB-agnostic way
        row = await fetch_one(
            db,
            """
            SELECT id FROM inbox_messages
            WHERE license_key_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            [license_id],
        )
        await commit_db(db)
        return row["id"] if row else 0


async def update_inbox_analysis(
    message_id: int,
    intent: str,
    urgency: str,
    sentiment: str,
    summary: str,
    draft_response: str
):
    """Update inbox message with AI analysis (DB agnostic)."""
    from db_helper import DB_TYPE  # type: ignore  # local import to avoid circulars

    now = datetime.utcnow()
    ts_value = now if DB_TYPE == "postgresql" else now.isoformat()

    async with get_db() as db:
        await execute_sql(
            db,
            """
            UPDATE inbox_messages SET
                intent = ?, urgency = ?, sentiment = ?,
                ai_summary = ?, ai_draft_response = ?,
                status = 'analyzed', processed_at = ?
            WHERE id = ?
            """,
            [intent, urgency, sentiment, summary, draft_response, ts_value, message_id],
        )
        await commit_db(db)


async def get_inbox_messages(
    license_id: int,
    status: str = None,
    channel: str = None,
    limit: int = 50
) -> List[dict]:
    """Get inbox messages for a license (SQLite & PostgreSQL compatible)."""

    query = "SELECT * FROM inbox_messages WHERE license_key_id = ?"
    params = [license_id]

    if status:
        query += " AND status = ?"
        params.append(status)

    if channel:
        query += " AND channel = ?"
        params.append(channel)

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    async with get_db() as db:
        rows = await fetch_all(db, query, params)
        return rows


async def update_inbox_status(message_id: int, status: str):
    """Update inbox message status (DB agnostic)."""
    async with get_db() as db:
        await execute_sql(
            db,
            "UPDATE inbox_messages SET status = ? WHERE id = ?",
            [status, message_id],
        )
        await commit_db(db)


# ============ Outbox Functions ============

async def create_outbox_message(
    inbox_message_id: int,
    license_id: int,
    channel: str,
    body: str,
    recipient_id: str = None,
    recipient_email: str = None,
    subject: str = None
) -> int:
    """Create outbox message for approval (DB agnostic)."""
    async with get_db() as db:
        await execute_sql(
            db,
            """
            INSERT INTO outbox_messages 
                (inbox_message_id, license_key_id, channel, recipient_id,
                 recipient_email, subject, body)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [inbox_message_id, license_id, channel, recipient_id, recipient_email, subject, body],
        )

        row = await fetch_one(
            db,
            """
            SELECT id FROM outbox_messages
            WHERE license_key_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            [license_id],
        )
        await commit_db(db)
        return row["id"] if row else 0


async def approve_outbox_message(message_id: int, edited_body: str = None):
    """Approve an outbox message for sending (DB agnostic)."""
    from db_helper import DB_TYPE  # type: ignore  # local import

    now = datetime.utcnow()
    ts_value = now if DB_TYPE == "postgresql" else now.isoformat()

    async with get_db() as db:
        if edited_body:
            await execute_sql(
                db,
                """
                UPDATE outbox_messages SET
                    body = ?, status = 'approved', approved_at = ?
                WHERE id = ?
                """,
                [edited_body, ts_value, message_id],
            )
        else:
            await execute_sql(
                db,
                """
                UPDATE outbox_messages SET
                    status = 'approved', approved_at = ?
                WHERE id = ?
                """,
                [ts_value, message_id],
            )
        await commit_db(db)


async def mark_outbox_sent(message_id: int):
    """Mark outbox message as sent (DB agnostic)."""
    from db_helper import DB_TYPE  # type: ignore  # local import

    now = datetime.utcnow()
    ts_value = now if DB_TYPE == "postgresql" else now.isoformat()

    async with get_db() as db:
        await execute_sql(
            db,
            """
            UPDATE outbox_messages SET
                status = 'sent', sent_at = ?
            WHERE id = ?
            """,
            [ts_value, message_id],
        )
        await commit_db(db)


async def get_pending_outbox(license_id: int) -> List[dict]:
    """Get pending outbox messages (DB agnostic)."""
    async with get_db() as db:
        rows = await fetch_all(
            db,
            """
            SELECT o.*, i.sender_name, i.body as original_message
            FROM outbox_messages o
            JOIN inbox_messages i ON o.inbox_message_id = i.id
            WHERE o.license_key_id = ? AND o.status IN ('pending', 'approved')
            ORDER BY o.created_at DESC
            """,
            [license_id],
        )
        return rows


# ============ Utility Functions ============

def simple_encrypt(text: str) -> str:
    """Encrypt sensitive data using enhanced security module"""
    try:
        from security_enhanced import encrypt_sensitive_data  # type: ignore
        return encrypt_sensitive_data(text)
    except (ImportError, ModuleNotFoundError):
        # Fallback to simple XOR if enhanced security not available
        key = os.getenv("ENCRYPTION_KEY", "almudeer-secret-key-2024")
        encrypted = []
        for i, char in enumerate(text):
            encrypted.append(chr(ord(char) ^ ord(key[i % len(key)])))
        return ''.join(encrypted)


def simple_decrypt(encrypted: str) -> str:
    """Decrypt sensitive data using enhanced security module"""
    try:
        from security_enhanced import decrypt_sensitive_data  # type: ignore
        return decrypt_sensitive_data(encrypted)
    except (ImportError, ModuleNotFoundError):
        # Fallback to simple XOR if enhanced security not available
        return simple_encrypt(encrypted)  # XOR is symmetric


import asyncio


async def init_customers_and_analytics():
    """Initialize customers, analytics, notifications and related tables.

    Uses the generic db_helper layer so it works for both SQLite (dev)
    and PostgreSQL (production).
    """
    async with get_db() as db:
        # WhatsApp Configuration
        await execute_sql(db, f"""
            CREATE TABLE IF NOT EXISTS whatsapp_configs (
                id {ID_PK},
                license_key_id INTEGER NOT NULL UNIQUE,
                phone_number_id TEXT NOT NULL,
                access_token TEXT NOT NULL,
                business_account_id TEXT,
                verify_token TEXT NOT NULL,
                webhook_secret TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                auto_reply_enabled BOOLEAN DEFAULT FALSE,
                created_at {TIMESTAMP_NOW},
                updated_at TIMESTAMP,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)

        # Team Members (Multi-User Support)
        await execute_sql(db, f"""
            CREATE TABLE IF NOT EXISTS team_members (
                id {ID_PK},
                license_key_id INTEGER NOT NULL,
                email TEXT NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT,
                role TEXT NOT NULL DEFAULT 'agent',
                permissions TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                last_login_at TIMESTAMP,
                created_at {TIMESTAMP_NOW},
                invited_by INTEGER,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id),
                FOREIGN KEY (invited_by) REFERENCES team_members(id),
                UNIQUE(license_key_id, email)
            )
        """)

        # Team Activity Log
        await execute_sql(db, f"""
            CREATE TABLE IF NOT EXISTS team_activity_log (
                id {ID_PK},
                license_key_id INTEGER NOT NULL,
                team_member_id INTEGER,
                action TEXT NOT NULL,
                details TEXT,
                ip_address TEXT,
                created_at {TIMESTAMP_NOW},
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id),
                FOREIGN KEY (team_member_id) REFERENCES team_members(id)
            )
        """)

        # Notifications (the main notifications table used by the dashboard)
        await execute_sql(db, f"""
            CREATE TABLE IF NOT EXISTS notifications (
                id {ID_PK},
                license_key_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                priority TEXT DEFAULT 'normal',
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                link TEXT,
                is_read BOOLEAN DEFAULT FALSE,
                created_at {TIMESTAMP_NOW},
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)

        # Customer Profiles
        await execute_sql(db, f"""
            CREATE TABLE IF NOT EXISTS customers (
                id {ID_PK},
                license_key_id INTEGER NOT NULL,
                name TEXT,
                phone TEXT,
                email TEXT,
                company TEXT,
                notes TEXT,
                tags TEXT,
                total_messages INTEGER DEFAULT 0,
                last_contact_at TIMESTAMP,
                sentiment_score REAL DEFAULT 0,
                is_vip BOOLEAN DEFAULT FALSE,
                created_at {TIMESTAMP_NOW},
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)

        # Link inbox messages to customers
        await execute_sql(db, """
            CREATE TABLE IF NOT EXISTS customer_messages (
                customer_id INTEGER,
                inbox_message_id INTEGER,
                PRIMARY KEY (customer_id, inbox_message_id),
                FOREIGN KEY (customer_id) REFERENCES customers(id),
                FOREIGN KEY (inbox_message_id) REFERENCES inbox_messages(id)
            )
        """)

        # Analytics/Metrics tracking
        await execute_sql(db, f"""
            CREATE TABLE IF NOT EXISTS analytics (
                id {ID_PK},
                license_key_id INTEGER NOT NULL,
                date DATE NOT NULL,
                messages_received INTEGER DEFAULT 0,
                messages_replied INTEGER DEFAULT 0,
                auto_replies INTEGER DEFAULT 0,
                avg_response_time_seconds INTEGER,
                positive_sentiment INTEGER DEFAULT 0,
                negative_sentiment INTEGER DEFAULT 0,
                neutral_sentiment INTEGER DEFAULT 0,
                time_saved_seconds INTEGER DEFAULT 0,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id),
                UNIQUE(license_key_id, date)
            )
        """)

        # User preferences (UI + AI behavior / tone)
        await execute_sql(db, """
            CREATE TABLE IF NOT EXISTS user_preferences (
                license_key_id INTEGER PRIMARY KEY,
                dark_mode BOOLEAN DEFAULT FALSE,
                notifications_enabled BOOLEAN DEFAULT TRUE,
                notification_sound BOOLEAN DEFAULT TRUE,
                auto_reply_delay_seconds INTEGER DEFAULT 30,
                language TEXT DEFAULT 'ar',
                onboarding_completed BOOLEAN DEFAULT FALSE,
                -- AI / workspace tone & business profile
                tone TEXT DEFAULT 'formal',
                custom_tone_guidelines TEXT,
                business_name TEXT,
                industry TEXT,
                products_services TEXT,
                preferred_languages TEXT,
                reply_length TEXT,
                formality_level TEXT,
                FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
            )
        """)

        # Performance indexes for analytics & customers
        await execute_sql(db, """
            CREATE INDEX IF NOT EXISTS idx_analytics_license_date
            ON analytics(license_key_id, date)
        """)
        await execute_sql(db, """
            CREATE INDEX IF NOT EXISTS idx_customers_license_last_contact
            ON customers(license_key_id, last_contact_at)
        """)
        await execute_sql(db, """
            CREATE INDEX IF NOT EXISTS idx_notifications_license_created
            ON notifications(license_key_id, created_at)
        """)

        await commit_db(db)
        print("Customers, Analytics & Notifications tables initialized")


# ============ Customer Profiles ============

async def get_or_create_customer(
    license_id: int,
    phone: str = None,
    email: str = None,
    name: str = None
) -> dict:
    """Get existing customer or create new one"""
    async with get_db() as db:
        # Try to find by phone or email
        if phone:
            row = await fetch_one(
                db,
                "SELECT * FROM customers WHERE license_key_id = ? AND phone = ?",
                [license_id, phone]
            )
            if row:
                return dict(row)
        
        if email:
            row = await fetch_one(
                db,
                "SELECT * FROM customers WHERE license_key_id = ? AND email = ?",
                [license_id, email]
            )
            if row:
                return dict(row)
        
        # Create new customer
        await execute_sql(
            db,
            """
            INSERT INTO customers (license_key_id, name, phone, email, segment, lead_score)
            VALUES (?, ?, ?, ?, 'New', 0)
            """,
            [license_id, name, phone, email]
        )
        
        # Fetch the created customer
        row = await fetch_one(
            db,
            """
            SELECT * FROM customers 
            WHERE license_key_id = ? AND (phone = ? OR email = ?)
            ORDER BY id DESC LIMIT 1
            """,
            [license_id, phone or "", email or ""]
        )
        await commit_db(db)
        
        if row:
            return dict(row)
        
        return {
            "id": 0,
            "license_key_id": license_id,
            "name": name,
            "phone": phone,
            "email": email,
            "total_messages": 0,
            "is_vip": False,
            "segment": "New",
            "lead_score": 0
        }


async def get_customers(license_id: int, limit: int = 100) -> List[dict]:
    """Get all customers for a license (SQLite & PostgreSQL compatible)."""
    async with get_db() as db:
        rows = await fetch_all(
            db,
            """
            SELECT * FROM customers 
            WHERE license_key_id = ? 
            ORDER BY last_contact_at DESC
            LIMIT ?
            """,
            [license_id, limit],
        )
        return rows


async def get_customer(license_id: int, customer_id: int) -> Optional[dict]:
    """Get a specific customer"""
    async with get_db() as db:
        row = await fetch_one(
            db,
            "SELECT * FROM customers WHERE id = ? AND license_key_id = ?",
            [customer_id, license_id]
        )
        return dict(row) if row else None


async def update_customer(
    license_id: int,
    customer_id: int,
    **kwargs
) -> bool:
    """Update customer details"""
    allowed_fields = ['name', 'phone', 'email', 'company', 'notes', 'tags', 'is_vip', 'segment', 'lead_score']
    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}
    
    if not updates:
        return False
    
    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values()) + [customer_id, license_id]
    
    async with get_db() as db:
        await execute_sql(
            db,
            f"UPDATE customers SET {set_clause} WHERE id = ? AND license_key_id = ?",
            values
        )
        await commit_db(db)
        return True


async def increment_customer_messages(customer_id: int):
    """Increment customer message count and update last contact"""
    from db_helper import DB_TYPE  # type: ignore
    now = datetime.utcnow()
    if now.tzinfo is not None:
        now = now.astimezone(timezone.utc).replace(tzinfo=None)
    
    ts_value = now if DB_TYPE == "postgresql" else now.isoformat()
    
    async with get_db() as db:
        await execute_sql(
            db,
            """
            UPDATE customers SET 
                total_messages = total_messages + 1,
                last_contact_at = ?
            WHERE id = ?
            """,
            [ts_value, customer_id]
        )
        await commit_db(db)


# ============ Analytics ============

async def update_daily_analytics(
    license_id: int,
    messages_received: int = 0,
    messages_replied: int = 0,
    auto_replies: int = 0,
    sentiment: str = None,
    time_saved_seconds: int = 0
):
    """Update daily analytics"""
    from db_helper import DB_TYPE  # type: ignore
    today = datetime.utcnow().date()
    if DB_TYPE == "postgresql":
        today_value = today
    else:
        today_value = today.isoformat()
    
    async with get_db() as db:
        # Get or create today's record
        row = await fetch_one(
            db,
            "SELECT id FROM analytics WHERE license_key_id = ? AND date = ?",
            [license_id, today_value]
        )
        
        if row:
            # Update existing
            sentiment_field = ""
            if sentiment == "إيجابي":
                sentiment_field = ", positive_sentiment = positive_sentiment + 1"
            elif sentiment == "سلبي":
                sentiment_field = ", negative_sentiment = negative_sentiment + 1"
            elif sentiment == "محايد":
                sentiment_field = ", neutral_sentiment = neutral_sentiment + 1"
            
            await execute_sql(
                db,
                f"""
                UPDATE analytics SET
                    messages_received = messages_received + ?,
                    messages_replied = messages_replied + ?,
                    auto_replies = auto_replies + ?,
                    time_saved_seconds = time_saved_seconds + ?
                    {sentiment_field}
                WHERE license_key_id = ? AND date = ?
                """,
                [messages_received, messages_replied, auto_replies, 
                 time_saved_seconds, license_id, today_value]
            )
        else:
            # Create new
            pos = 1 if sentiment == "إيجابي" else 0
            neg = 1 if sentiment == "سلبي" else 0
            neu = 1 if sentiment == "محايد" else 0
            
            await execute_sql(
                db,
                """
                INSERT INTO analytics 
                (license_key_id, date, messages_received, messages_replied,
                 auto_replies, positive_sentiment, negative_sentiment,
                 neutral_sentiment, time_saved_seconds)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [license_id, today_value, messages_received, messages_replied,
                 auto_replies, pos, neg, neu, time_saved_seconds]
            )
        
        await commit_db(db)


async def get_analytics_summary(license_id: int, days: int = 30) -> dict:
    """
    Get analytics summary for dashboard.

    Uses the unified db_helper layer so it works with both SQLite and PostgreSQL.
    """
    # Calculate cutoff date as a real date object.
    # - For PostgreSQL, asyncpg expects a date instance.
    # - For SQLite, the driver will convert it to a string automatically.
    cutoff_date = datetime.utcnow().date() - timedelta(days=days)

    async with get_db() as db:
        row = await fetch_one(
            db,
            """
            SELECT 
                SUM(messages_received) as total_received,
                SUM(messages_replied) as total_replied,
                SUM(auto_replies) as total_auto,
                SUM(positive_sentiment) as positive,
                SUM(negative_sentiment) as negative,
                SUM(neutral_sentiment) as neutral,
                SUM(time_saved_seconds) as time_saved
            FROM analytics 
            WHERE license_key_id = ?
              AND date >= ?
            """,
            [license_id, cutoff_date],
        )

    if row:
        data = row
        total_sentiment = (data.get("positive") or 0) + (data.get("negative") or 0) + (data.get("neutral") or 0)

        return {
            "total_messages": data.get("total_received") or 0,
            "total_replied": data.get("total_replied") or 0,
            "auto_replies": data.get("total_auto") or 0,
            "time_saved_hours": round((data.get("time_saved") or 0) / 3600, 1),
            "satisfaction_rate": round((data.get("positive") or 0) / max(total_sentiment, 1) * 100),
            "response_rate": round(
                (data.get("total_replied") or 0) / max(data.get("total_received") or 1, 1) * 100
            ),
        }

    return {
        "total_messages": 0,
        "total_replied": 0,
        "auto_replies": 0,
        "time_saved_hours": 0,
        "satisfaction_rate": 0,
        "response_rate": 0,
    }


# ============ User Preferences ============

async def get_preferences(license_id: int) -> dict:
    """Get user preferences"""
    async with get_db() as db:
        row = await fetch_one(
            db,
            "SELECT * FROM user_preferences WHERE license_key_id = ?",
            [license_id]
        )
        if row:
            return dict(row)

        # Create default preferences including AI tone defaults
        await execute_sql(
            db,
            """
            INSERT INTO user_preferences (
                license_key_id,
                tone,
                language,
                preferred_languages
            ) VALUES (?, 'formal', 'ar', 'ar')
            """,
            [license_id]
        )
        await commit_db(db)

        return {
            "license_key_id": license_id,
            "dark_mode": False,
            "notifications_enabled": True,
            "notification_sound": True,
            "auto_reply_delay_seconds": 30,
            "language": "ar",
            "onboarding_completed": False,
            "tone": "formal",
            "custom_tone_guidelines": None,
            "business_name": None,
            "industry": None,
            "products_services": None,
            "preferred_languages": "ar",
            "reply_length": None,
            "formality_level": None,
        }


async def update_preferences(license_id: int, **kwargs) -> bool:
    """Update user preferences"""
    from db_helper import DB_TYPE  # type: ignore
    allowed = [
        'dark_mode',
        'notifications_enabled',
        'notification_sound',
        'auto_reply_delay_seconds',
        'onboarding_completed',
        # AI / workspace tone & business profile
        'tone',
        'custom_tone_guidelines',
        'business_name',
        'industry',
        'products_services',
        'preferred_languages',
        'reply_length',
        'formality_level',
    ]
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    
    if not updates:
        return False
    
    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values()) + [license_id]
    
    async with get_db() as db:
        if DB_TYPE == "postgresql":
            # PostgreSQL uses ON CONFLICT with different syntax
            await execute_sql(
                db,
                f"""
                INSERT INTO user_preferences (license_key_id, {', '.join(updates.keys())})
                VALUES (?, {', '.join(['?' for _ in updates])})
                ON CONFLICT (license_key_id) DO UPDATE SET {set_clause}
                """,
                [license_id] + list(updates.values()) + list(updates.values())
            )
        else:
            # SQLite
            await execute_sql(
                db,
                f"""
                INSERT INTO user_preferences (license_key_id) VALUES (?)
                ON CONFLICT(license_key_id) DO UPDATE SET {set_clause}
                """,
                [license_id] + list(updates.values())
            )
        await commit_db(db)
        return True


# ============ Notifications ============

async def create_notification(
    license_id: int,
    notification_type: str,
    title: str,
    message: str,
    priority: str = "normal",
    link: str = None
) -> int:
    """Create a new notification"""
    async with get_db() as db:
        await execute_sql(
            db,
            """
            INSERT INTO notifications (license_key_id, type, priority, title, message, link)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [license_id, notification_type, priority, title, message, link],
        )

        row = await fetch_one(
            db,
            """
            SELECT id FROM notifications
            WHERE license_key_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            [license_id],
        )
        await commit_db(db)
        return row["id"] if row else 0


async def get_notifications(license_id: int, unread_only: bool = False, limit: int = 50) -> List[dict]:
    """Get notifications for a user"""
    async with get_db() as db:
        query = "SELECT * FROM notifications WHERE license_key_id = ?"
        params = [license_id]

        if unread_only:
            query += " AND is_read = FALSE"

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        rows = await fetch_all(db, query, params)
        return rows


async def get_unread_count(license_id: int) -> int:
    """Get count of unread notifications"""
    async with get_db() as db:
        row = await fetch_one(
            db,
            "SELECT COUNT(*) AS cnt FROM notifications WHERE license_key_id = ? AND is_read = FALSE",
            [license_id],
        )
        return int(row.get("cnt", 0)) if row else 0


async def mark_notification_read(license_id: int, notification_id: int) -> bool:
    """Mark a notification as read"""
    async with get_db() as db:
        await execute_sql(
            db,
            "UPDATE notifications SET is_read = TRUE WHERE id = ? AND license_key_id = ?",
            [notification_id, license_id],
        )
        await commit_db(db)
        return True


async def mark_all_notifications_read(license_id: int) -> bool:
    """Mark all notifications as read"""
    async with get_db() as db:
        await execute_sql(
            db,
            "UPDATE notifications SET is_read = TRUE WHERE license_key_id = ?",
            [license_id],
        )
        await commit_db(db)
        return True


async def delete_old_notifications(days: int = 30):
    """Delete notifications older than specified days"""
    async with get_db() as db:
        # Use a cross-database friendly cutoff timestamp
        cutoff_sql = "CURRENT_TIMESTAMP - INTERVAL '%s days'" if DB_TYPE == "postgresql" else "datetime('now', ?)"
        if DB_TYPE == "postgresql":
            # In Postgres we can inline the interval, no parameters needed for the interval itself
            sql = f"DELETE FROM notifications WHERE created_at < {cutoff_sql}"
            await execute_sql(db, sql, [days])
        else:
            await execute_sql(
                db,
                "DELETE FROM notifications WHERE created_at < datetime('now', ?)",
                [f"-{days} days"],
            )
        await commit_db(db)


# ============ Team Management ============

ROLES = {
    "owner": {
        "name": "المالك",
        "permissions": ["*"]  # All permissions
    },
    "admin": {
        "name": "مدير",
        "permissions": ["read", "write", "reply", "manage_integrations", "view_analytics"]
    },
    "agent": {
        "name": "موظف",
        "permissions": ["read", "write", "reply"]
    },
    "viewer": {
        "name": "مشاهد",
        "permissions": ["read", "view_analytics"]
    }
}


async def create_team_member(
    license_id: int,
    email: str,
    name: str,
    role: str = "agent",
    invited_by: int = None,
    password_hash: str = None
) -> int:
    """Create a new team member (SQLite & PostgreSQL compatible)."""
    if role not in ROLES:
        role = "agent"

    normalized_email = email.lower()
    permissions = ",".join(ROLES[role]["permissions"])

    async with get_db() as db:
        await execute_sql(
            db,
            """
            INSERT INTO team_members
                (license_key_id, email, name, role, invited_by, password_hash, permissions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [license_id, normalized_email, name, role, invited_by, password_hash, permissions],
        )

        # Fetch created member id in a DB‑agnostic way
        row = await fetch_one(
            db,
            """
            SELECT id FROM team_members
            WHERE license_key_id = ? AND email = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            [license_id, normalized_email],
        )
        await commit_db(db)
        return row["id"] if row else 0


async def get_team_members(license_id: int) -> List[dict]:
    """Get all team members for a license"""
    async with get_db() as db:
        rows = await fetch_all(
            db,
            """
            SELECT id, email, name, role, is_active, last_login_at, created_at
            FROM team_members 
            WHERE license_key_id = ?
            ORDER BY created_at ASC
            """,
            [license_id],
        )
        return rows


async def get_team_member(license_id: int, member_id: int) -> Optional[dict]:
    """Get a specific team member"""
    async with get_db() as db:
        return await fetch_one(
            db,
            """
            SELECT * FROM team_members 
            WHERE id = ? AND license_key_id = ?
            """,
            [member_id, license_id],
        )


async def get_team_member_by_email(license_id: int, email: str) -> Optional[dict]:
    """Get team member by email"""
    async with get_db() as db:
        return await fetch_one(
            db,
            """
            SELECT * FROM team_members 
            WHERE email = ? AND license_key_id = ?
            """,
            [email.lower(), license_id],
        )


async def update_team_member(
    license_id: int,
    member_id: int,
    **kwargs
) -> bool:
    """Update team member details"""
    allowed = ['name', 'role', 'is_active', 'permissions']
    updates = {k: v for k, v in kwargs.items() if k in allowed}
    
    if not updates:
        return False
    
    # If role is being updated, also update permissions
    if 'role' in updates and updates['role'] in ROLES:
        updates['permissions'] = ",".join(ROLES[updates['role']]["permissions"])
    
    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values()) + [member_id, license_id]

    async with get_db() as db:
        await execute_sql(
            db,
            f"""
            UPDATE team_members SET {set_clause}
            WHERE id = ? AND license_key_id = ?
            """,
            values,
        )
        await commit_db(db)
        return True


async def delete_team_member(license_id: int, member_id: int) -> bool:
    """Delete a team member"""
    async with get_db() as db:
        await execute_sql(
            db,
            "DELETE FROM team_members WHERE id = ? AND license_key_id = ?",
            [member_id, license_id],
        )
        await commit_db(db)
        return True


async def check_permission(license_id: int, member_id: int, permission: str) -> bool:
    """Check if a team member has a specific permission"""
    member = await get_team_member(license_id, member_id)
    if not member:
        return False
    
    permissions = (member.get('permissions') or '').split(',')
    return '*' in permissions or permission in permissions


async def log_team_activity(
    license_id: int,
    member_id: int,
    action: str,
    details: str = None,
    ip_address: str = None
):
    """Log team member activity"""
    async with get_db() as db:
        await execute_sql(
            db,
            """
            INSERT INTO team_activity_log 
            (license_key_id, team_member_id, action, details, ip_address)
            VALUES (?, ?, ?, ?, ?)
            """,
            [license_id, member_id, action, details, ip_address],
        )
        await commit_db(db)


async def get_team_activity(license_id: int, limit: int = 100) -> List[dict]:
    """Get team activity log"""
    async with get_db() as db:
        rows = await fetch_all(
            db,
            """
            SELECT a.*, m.name as member_name
            FROM team_activity_log a
            LEFT JOIN team_members m ON a.team_member_id = m.id
            WHERE a.license_key_id = ?
            ORDER BY a.created_at DESC
            LIMIT ?
            """,
            [license_id, limit],
        )
        return rows


# Smart notification triggers
async def create_smart_notification(
    license_id: int,
    event_type: str,
    data: dict = None
):
    """Create smart notifications based on events"""
    data = data or {}
    
    notifications_map = {
        "new_message": {
            "type": "message",
            "priority": "normal",
            "title": "📨 رسالة جديدة",
            "message": f"رسالة جديدة من {data.get('sender', 'مرسل مجهول')}",
            "link": "/dashboard/inbox"
        },
        "urgent_message": {
            "type": "urgent",
            "priority": "high",
            "title": "🔴 رسالة عاجلة",
            "message": f"رسالة عاجلة تحتاج انتباهك من {data.get('sender', 'مرسل')}",
            "link": "/dashboard/inbox"
        },
        "negative_sentiment": {
            "type": "alert",
            "priority": "high",
            "title": "⚠️ عميل غاضب",
            "message": f"تم اكتشاف شكوى من {data.get('customer', 'عميل')}",
            "link": "/dashboard/inbox"
        },
        "vip_message": {
            "type": "vip",
            "priority": "high",
            "title": "⭐ رسالة من عميل VIP",
            "message": f"رسالة من عميل VIP: {data.get('customer', 'عميل مهم')}",
            "link": "/dashboard/inbox"
        },
        "milestone": {
            "type": "achievement",
            "priority": "normal",
            "title": "🎉 إنجاز جديد!",
            "message": data.get('message', 'لقد حققت إنجازاً جديداً!'),
            "link": "/dashboard/overview"
        },
        "daily_summary": {
            "type": "summary",
            "priority": "low",
            "title": "📊 ملخص اليوم",
            "message": f"عالجت {data.get('count', 0)} رسالة ووفرت {data.get('time_saved', 0)} دقيقة",
            "link": "/dashboard/overview"
        }
    }
    
    if event_type not in notifications_map:
        return None
    
    notif = notifications_map[event_type]
    
    return await create_notification(
        license_id=license_id,
        notification_type=notif["type"],
        title=notif["title"],
        message=notif["message"],
        priority=notif["priority"],
        link=notif.get("link")
    )


def init_models():
    """Initialize models synchronously"""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(init_enhanced_tables())
            asyncio.create_task(init_customers_and_analytics())
        else:
            loop.run_until_complete(init_enhanced_tables())
            loop.run_until_complete(init_customers_and_analytics())
    except RuntimeError:
        asyncio.run(init_enhanced_tables())
        asyncio.run(init_customers_and_analytics())



