/**
 * public/js/api.js
 *
 * Eventify — Frontend API Client Helper
 *
 * A lightweight, vanilla JavaScript helper for making fetch requests to the
 * same-origin /api endpoints. Handles network errors, HTTP error status codes,
 * and JSON parsing errors consistently without external libraries.
 */

(function () {
    "use strict";

    const BASE_URL = "/api";

    /**
     * Perform an HTTP request to the Eventify backend API.
     * @param {string} endpoint - API path (e.g. "/events" or "events")
     * @param {RequestInit} [options] - Fetch options
     * @returns {Promise<any>} Parsed response data
     */
    async function request(endpoint, options = {}) {
        const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        const url = `${BASE_URL}${cleanEndpoint}`;

        let response;
        try {
            response = await fetch(url, {
                headers: {
                    Accept: "application/json",
                    ...(options.body ? { "Content-Type": "application/json" } : {}),
                    ...(options.headers || {})
                },
                ...options
            });
        } catch (networkError) {
            const err = new Error("Network error: Unable to connect to the server. Please check your connection.");
            err.isNetworkError = true;
            throw err;
        }

        let data = null;
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            try {
                data = await response.json();
            } catch (jsonErr) {
                const err = new Error("Invalid response format: Expected JSON from server.");
                err.status = response.status;
                throw err;
            }
        } else {
            const text = await response.text();
            if (!response.ok) {
                const err = new Error(text || `Request failed with HTTP status ${response.status}`);
                err.status = response.status;
                throw err;
            }
            data = text;
        }

        if (!response.ok) {
            const message = (data && data.message)
                ? data.message
                : `Request failed with status ${response.status} (${response.statusText})`;
            const err = new Error(message);
            err.status = response.status;
            err.data = data;
            throw err;
        }

        return data;
    }

    /**
     * Eventify API methods
     */
    const api = {
        /**
         * Fetch all events, optionally filtered by category and/or search query.
         * @param {Object} [params]
         * @param {string} [params.category] - Category name filter
         * @param {string} [params.search] - Search keyword
         * @returns {Promise<{success: boolean, count: number, data: Array}>}
         */
        getEvents(params = {}) {
            const query = new URLSearchParams();
            if (params.category && params.category !== "All") {
                query.set("category", params.category);
            }
            if (params.search && params.search.trim()) {
                query.set("search", params.search.trim());
            }
            const qs = query.toString();
            return request(`/events${qs ? "?" + qs : ""}`);
        },

        /**
         * Fetch a single event by numeric ID.
         * @param {number|string} id - Event ID
         * @returns {Promise<{success: boolean, data: Object}>}
         */
        getEventById(id) {
            return request(`/events/${encodeURIComponent(id)}`);
        },

        /**
         * Fetch all categories.
         * @returns {Promise<{success: boolean, data: Array<{id: number, name: string}>}>}
         */
        getCategories() {
            return request("/categories");
        },

        /**
         * Fetch all bookings.
         * @returns {Promise<{success: boolean, count: number, data: Array}>}
         */
        getBookings() {
            return request("/bookings");
        },

        /**
         * Create a new ticket booking for an event.
         * @param {number|string} eventId
         * @param {number} quantity
         * @returns {Promise<{success: boolean, message: string, data: Object}>}
         */
        createBooking(eventId, quantity) {
            return request("/bookings", {
                method: "POST",
                body: JSON.stringify({ eventId: Number(eventId), quantity: Number(quantity) })
            });
        },

        /**
         * Cancel an existing booking by reference ID.
         * @param {string} bookingId
         * @returns {Promise<{success: boolean, message: string, data: Object}>}
         */
        cancelBooking(bookingId) {
            return request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
                method: "POST"
            });
        },

        request
    };

    window.api = api;
})();
