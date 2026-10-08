import { useCallback, useEffect, useRef } from 'react';
import axios from 'axios';

// Previews do not reserve a number. The server assigns the final number when saved.
export default function useDocumentNumberPreview(type, field, setForm) {
    const pendingRequest = useRef(null);

    const cancelNumberPreview = useCallback(() => {
        pendingRequest.current?.abort();
        pendingRequest.current = null;
    }, []);

    const refreshNumberPreview = useCallback(async () => {
        cancelNumberPreview();
        const request = new AbortController();
        pendingRequest.current = request;
        try {
            const { data } = await axios.get(`/document-numbers/${type}`, { signal: request.signal });
            if (request.signal.aborted || pendingRequest.current !== request) return;
            const nextNumber = data.data?.nextNumber;
            if (nextNumber) setForm(previous => previous && !previous[field] ? { ...previous, [field]: nextNumber } : previous);
        } catch {
            // Saving still assigns the number if a preview could not be loaded.
        } finally {
            if (pendingRequest.current === request) pendingRequest.current = null;
        }
    }, [cancelNumberPreview, field, setForm, type]);

    useEffect(() => cancelNumberPreview, [cancelNumberPreview]);

    return { refreshNumberPreview, cancelNumberPreview };
}
