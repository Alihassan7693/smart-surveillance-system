import logging
import os
from copy import deepcopy

from config import FIREBASE_CREDENTIALS, FIREBASE_DB_URL, FIREBASE_ENABLED

logger = logging.getLogger(__name__)

_db_module = None   # firebase_admin.db module reference
_db_root = None     # Firebase Realtime Database root reference


class RTDBDocumentSnapshot:
    def __init__(self, ref, data):
        self._ref = ref
        self._data = data

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return deepcopy(self._data) if self._data is not None else {}

    @property
    def id(self):
        return self._ref.key


class RTDBDocumentReference:
    def __init__(self, ref):
        self._ref = ref

    def set(self, data, merge=False):
        if merge:
            existing = self._ref.get() or {}
            merged = {**existing, **data}
            self._ref.set(merged)
        else:
            self._ref.set(data)

    def update(self, data):
        self._ref.update(data)

    def delete(self):
        self._ref.delete()

    def get(self):
        return RTDBDocumentSnapshot(self._ref, self._ref.get())


class RTDBCollectionReference:
    def __init__(self, ref, filters=None, order_by=None, offset_value=0, limit_value=None):
        self._ref = ref
        self._filters = filters or []
        self._order_by = order_by
        self._offset = offset_value
        self._limit = limit_value

    def document(self, doc_id=None):
        if doc_id is None:
            raise ValueError("Document ID is required for Realtime Database document references")
        return RTDBDocumentReference(self._ref.child(doc_id))

    def where(self, field, op, value):
        return RTDBCollectionReference(
            self._ref,
            filters=self._filters + [(field, op, value)],
            order_by=self._order_by,
            offset_value=self._offset,
            limit_value=self._limit,
        )

    def order_by(self, field, direction='ASCENDING'):
        return RTDBCollectionReference(
            self._ref,
            filters=self._filters,
            order_by=(field, direction),
            offset_value=self._offset,
            limit_value=self._limit,
        )

    def offset(self, offset_value):
        return RTDBCollectionReference(
            self._ref,
            filters=self._filters,
            order_by=self._order_by,
            offset_value=offset_value,
            limit_value=self._limit,
        )

    def limit(self, limit_value):
        return RTDBCollectionReference(
            self._ref,
            filters=self._filters,
            order_by=self._order_by,
            offset_value=self._offset,
            limit_value=limit_value,
        )

    def _apply_filters(self, docs):
        def matches(item):
            for field, op, value in self._filters:
                # Safely access field from dict-like items
                item_value = item.get(field) if isinstance(item, dict) else None
                if op == '==' and item_value != value:
                    return False
                if op == '>=' and item_value < value:
                    return False
                if op == '<=' and item_value > value:
                    return False
            return True

        # Support being called with a single document (dict) or an iterable of docs
        if isinstance(docs, dict):
            return matches(docs)

        return [doc for doc in docs if matches(doc)]

    def _apply_ordering(self, docs):
        if not self._order_by:
            return docs
        field, direction = self._order_by
        reverse = direction == 'DESCENDING'
        if docs and isinstance(docs[0], tuple):
            return sorted(docs, key=lambda d: d[1].get(field, None), reverse=reverse)
        return sorted(docs, key=lambda d: d.get(field, None), reverse=reverse)

    def _apply_pagination(self, docs):
        if self._offset:
            docs = docs[self._offset:]
        if self._limit is not None:
            docs = docs[: self._limit]
        return docs

    def stream(self):
        raw = self._ref.get() or {}
        if not isinstance(raw, dict):
            return []

        docs = []
        for key, value in raw.items():
            if isinstance(value, dict):
                docs.append((key, value))

        filtered = [(key, value) for key, value in docs if self._apply_filters(value)]
        ordered = self._apply_ordering(filtered)
        paged = self._apply_pagination(ordered)

        return [RTDBDocumentSnapshot(self._ref.child(key), value) for key, value in paged]


class RTDBClientProxy:
    def __getattr__(self, item):
        db_module = get_db()
        if db_module is None:
            raise RuntimeError('Firebase Realtime Database is not initialized')
        return getattr(db_module, item)

    def collection(self, name):
        root = get_db_root()
        if root is None:
            raise RuntimeError('Firebase Realtime Database is not initialized')
        return RTDBCollectionReference(root.child(name))


def init_firebase() -> None:
    global _db_module, _db_root

    if not FIREBASE_ENABLED:
        logger.info('Firebase disabled in config')
        return

    if not os.path.exists(FIREBASE_CREDENTIALS):
        logger.warning(
            f"Firebase credentials not found: '{FIREBASE_CREDENTIALS}' "
            '— Firebase disabled. Detections will not be saved.'
        )
        return

    try:
        import firebase_admin
        from firebase_admin import credentials, db as firebase_db

        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS)
            firebase_admin.initialize_app(cred, {'databaseURL': FIREBASE_DB_URL})

        _db_module = firebase_db
        _db_root = firebase_db.reference('/')
        logger.info('✓ Firebase Realtime Database connected')

    except Exception as exc:
        logger.error(f'✗ Firebase init failed: {exc}')
        _db_module = None
        _db_root = None


def get_db():
    return _db_module


def get_db_root():
    return _db_root




# Export a proxy object that delegates to the initialized Realtime Database module.
# This keeps existing import usage such as `from database.firebase_client import db`.
db = RTDBClientProxy()
