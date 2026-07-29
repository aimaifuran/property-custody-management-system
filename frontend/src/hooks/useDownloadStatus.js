import { useCallback, useEffect, useRef, useState } from 'react';

const RESET_DELAY_MS = 2000;

// Tracks a small state machine per download key: 'idle' -> 'loading' -> 'success' -> 'idle'.
// Keys are caller-defined (e.g. `${recordId}-excel`) so each row/button animates independently.
export function useDownloadStatus() {
    const [statuses, setStatuses] = useState({});
    const timers = useRef({});

    useEffect(() => () => {
        Object.values(timers.current).forEach(clearTimeout);
    }, []);

    const run = useCallback(async (key, action) => {
        if (timers.current[key]) {
            clearTimeout(timers.current[key]);
            delete timers.current[key];
        }
        setStatuses((prev) => ({ ...prev, [key]: 'loading' }));
        try {
            await action();
            setStatuses((prev) => ({ ...prev, [key]: 'success' }));
            timers.current[key] = setTimeout(() => {
                setStatuses((prev) => ({ ...prev, [key]: 'idle' }));
                delete timers.current[key];
            }, RESET_DELAY_MS);
        } catch (error) {
            setStatuses((prev) => ({ ...prev, [key]: 'idle' }));
            console.error(error);
        }
    }, []);

    const getStatus = useCallback((key) => statuses[key] || 'idle', [statuses]);

    return { getStatus, run };
}
