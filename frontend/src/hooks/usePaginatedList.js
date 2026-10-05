import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

const DEFAULT_PAGINATION = { page: 1, limit: 10, total: 0, totalPages: 1 };

// Debounces the search box, resets to page 1 on every new search, and fetches
// `endpoint` with `page`/`limit`/`search` query params. Expects the backend to
// respond with `{ data: { items, pagination } }` (see backend/src/utils/paginate.js).
export function usePaginatedList(endpoint, { limit: initialLimit = 10 } = {}) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit, setLimitState] = useState(initialLimit);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [pagination, setPagination] = useState({ ...DEFAULT_PAGINATION, limit: initialLimit });

    const setLimit = useCallback((nextLimit) => {
        setLimitState(nextLimit);
        setPage(1);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await axios.get(endpoint, { params: { page, limit, search: search || undefined } });
            setItems(data.data?.items || []);
            setPagination(data.data?.pagination || { ...DEFAULT_PAGINATION, limit });
        } finally {
            setLoading(false);
        }
    }, [endpoint, page, limit, search]);

    useEffect(() => {
        load();
    }, [load]);

    return { items, loading, page, setPage, limit, setLimit, searchInput, setSearchInput, pagination, reload: load };
}
