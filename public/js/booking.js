/**
 * public/js/booking.js
 *
 * Eventify — Attendee Bookings Controller
 *
 * Connects the bookings dashboard to GET /api/bookings and POST /api/bookings/:id/cancel
 * via window.api. Manages live stats, status filtering, confirmation dialogs,
 * and safe DOM rendering.
 */

(function () {
    "use strict";

    const bookingsList = document.getElementById("bookings-list");
    const bookingFilter = document.getElementById("booking-filter");
    const totalBookingsEl = document.getElementById("total-bookings");
    const upcomingBookingsEl = document.getElementById("upcoming-bookings");
    const totalAmountEl = document.getElementById("total-amount");

    let allBookings = [];
    const cancellingIds = new Set();

    /**
     * Format an ISO or date string to local format (e.g. "15 Jan 2027").
     * @param {string} dateString
     * @returns {string}
     */
    function formatDate(dateString) {
        if (!dateString) return "Date TBA";
        try {
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return dateString;
            return d.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
            });
        } catch (_) {
            return dateString;
        }
    }

    /**
     * Check if a booking is in the future and confirmed.
     * @param {Object} booking
     * @returns {boolean}
     */
    function isUpcoming(booking) {
        if (!booking || !booking.date) return false;
        try {
            return new Date(booking.date) >= new Date() && booking.status === "CONFIRMED";
        } catch (_) {
            return false;
        }
    }

    /**
     * Update the KPI statistics cards at the top of the page.
     */
    function updateStatistics() {
        if (totalBookingsEl) {
            totalBookingsEl.textContent = allBookings.length;
        }

        if (upcomingBookingsEl) {
            upcomingBookingsEl.textContent = allBookings.filter(isUpcoming).length;
        }

        if (totalAmountEl) {
            const total = allBookings
                .filter(b => b.status !== "CANCELLED")
                .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
            totalAmountEl.textContent = "₹" + total.toLocaleString("en-IN");
        }
    }

    /**
     * Construct a single booking card element safely using DOM methods.
     * @param {Object} booking
     * @returns {HTMLElement} article.booking-card
     */
    function createBookingCard(booking) {
        const card = document.createElement("article");
        card.className = "booking-card";

        // 1. Emoji / Icon block
        const artDiv = document.createElement("div");
        artDiv.className = "booking-art";
        artDiv.textContent = booking.icon || "🎟️";

        // 2. Details block
        const detailsDiv = document.createElement("div");
        detailsDiv.className = "booking-details";

        // Topline: Title + Date + Status Badge
        const toplineDiv = document.createElement("div");
        toplineDiv.className = "booking-topline";

        const titleGroup = document.createElement("div");
        const titleH3 = document.createElement("h3");
        titleH3.textContent = booking.title || "Event Booking";

        const dateP = document.createElement("p");
        dateP.className = "booking-date";
        dateP.textContent = `📅 ${formatDate(booking.date)}`;

        titleGroup.appendChild(titleH3);
        titleGroup.appendChild(dateP);

        const statusClass = (booking.status || "confirmed").toLowerCase();
        const statusSpan = document.createElement("span");
        statusSpan.className = `booking-status status-${statusClass}`;
        statusSpan.textContent = booking.status || "CONFIRMED";

        toplineDiv.appendChild(titleGroup);
        toplineDiv.appendChild(statusSpan);

        // Venue & Reference details
        const venueP = document.createElement("p");
        venueP.className = "booking-venue";
        venueP.textContent = `📍 ${booking.venue || "Venue TBA"}`;

        const qtyNum = Number(booking.quantity) || 1;
        const refP = document.createElement("p");
        refP.className = "booking-reference";
        refP.textContent = `Booking ID: ${booking.id || "N/A"} · ${qtyNum} ticket${qtyNum === 1 ? "" : "s"}`;

        // Bottom: Price & Action buttons
        const bottomDiv = document.createElement("div");
        bottomDiv.className = "booking-bottom";

        const priceSpan = document.createElement("span");
        priceSpan.className = "booking-price";
        const amtNum = Number(booking.amount) || 0;
        priceSpan.textContent = `₹${amtNum.toLocaleString("en-IN")}`;

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "booking-actions";

        const viewLink = document.createElement("a");
        viewLink.className = "booking-action";
        viewLink.href = `event.html?id=${encodeURIComponent(booking.eventId)}`;
        viewLink.textContent = "View Event";
        actionsDiv.appendChild(viewLink);

        // Cancel button: only for confirmed upcoming bookings
        if (booking.status === "CONFIRMED" && isUpcoming(booking)) {
            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "booking-action cancel-button";
            cancelBtn.dataset.bookingId = booking.id;

            if (cancellingIds.has(booking.id)) {
                cancelBtn.disabled = true;
                cancelBtn.textContent = "Cancelling...";
            } else {
                cancelBtn.disabled = false;
                cancelBtn.textContent = "Cancel Booking";
                cancelBtn.addEventListener("click", () => handleCancel(booking.id, cancelBtn));
            }

            actionsDiv.appendChild(cancelBtn);
        }

        bottomDiv.appendChild(priceSpan);
        bottomDiv.appendChild(actionsDiv);

        detailsDiv.appendChild(toplineDiv);
        detailsDiv.appendChild(venueP);
        detailsDiv.appendChild(refP);
        detailsDiv.appendChild(bottomDiv);

        card.appendChild(artDiv);
        card.appendChild(detailsDiv);

        return card;
    }

    /**
     * Render the bookings matching the currently selected status filter.
     */
    function renderBookings() {
        if (!bookingsList) return;

        const selectedStatus = bookingFilter ? bookingFilter.value : "ALL";

        const filtered = allBookings.filter(b => {
            if (selectedStatus === "ALL") return true;
            return b.status === selectedStatus;
        });

        if (filtered.length === 0) {
            bookingsList.innerHTML = "";
            const emptyBox = document.createElement("div");
            emptyBox.className = "empty-bookings";

            const h3 = document.createElement("h3");
            h3.textContent = selectedStatus === "ALL" ? "No bookings yet" : "No bookings found";

            const p = document.createElement("p");
            p.textContent = selectedStatus === "ALL"
                ? "You haven't booked any experiences yet. Discover something exciting!"
                : "No reservations match this status filter.";

            const exploreLink = document.createElement("a");
            exploreLink.href = "index.html#events";
            exploreLink.className = "explore-button";
            exploreLink.textContent = "Explore Events";

            emptyBox.appendChild(h3);
            emptyBox.appendChild(p);
            emptyBox.appendChild(exploreLink);
            bookingsList.appendChild(emptyBox);
            return;
        }

        bookingsList.innerHTML = "";
        const fragment = document.createDocumentFragment();
        filtered.forEach(b => {
            fragment.appendChild(createBookingCard(b));
        });
        bookingsList.appendChild(fragment);
    }

    /**
     * Show loading state placeholder in the list.
     */
    function showLoading() {
        if (!bookingsList) return;
        bookingsList.innerHTML = "";
        const box = document.createElement("div");
        box.className = "empty-bookings";
        const p = document.createElement("p");
        p.textContent = "Loading your bookings...";
        box.appendChild(p);
        bookingsList.appendChild(box);
    }

    /**
     * Show error state with a retry action when fetching bookings fails.
     * @param {string} message
     */
    function showError(message) {
        if (!bookingsList) return;
        bookingsList.innerHTML = "";
        const box = document.createElement("div");
        box.className = "empty-bookings";

        const h3 = document.createElement("h3");
        h3.textContent = "Unable to load bookings";

        const p = document.createElement("p");
        p.textContent = message || "Failed to connect to the server. Please check your connection.";

        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.className = "explore-button";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => {
            loadBookings();
        });

        box.appendChild(h3);
        box.appendChild(p);
        box.appendChild(retryBtn);
        bookingsList.appendChild(box);
    }

    /**
     * Handle user cancellation of a booking with confirmation dialog and duplicate prevention.
     * @param {string} bookingId
     * @param {HTMLButtonElement} buttonEl
     */
    async function handleCancel(bookingId, buttonEl) {
        if (cancellingIds.has(bookingId)) return;

        const booking = allBookings.find(b => b.id === bookingId);
        const bookingTitle = booking ? `"${booking.title}"` : bookingId;

        const confirmed = window.confirm(
            `Are you sure you want to cancel your reservation for ${bookingTitle} (ID: ${bookingId})?\n\nThis action cannot be undone.`
        );

        if (!confirmed) return;

        cancellingIds.add(bookingId);
        buttonEl.disabled = true;
        buttonEl.textContent = "Cancelling...";

        try {
            const response = await window.api.cancelBooking(bookingId);

            if (response && response.success && response.data) {
                // Update local status with server-confirmed record
                const target = allBookings.find(b => b.id === bookingId);
                if (target) {
                    target.status = response.data.status || "CANCELLED";
                }
                cancellingIds.delete(bookingId);
                updateStatistics();
                renderBookings();
            } else {
                throw new Error((response && response.message) || "Cancellation could not be confirmed.");
            }
        } catch (err) {
            console.error("[Bookings] Cancellation failed:", err);
            cancellingIds.delete(bookingId);
            buttonEl.disabled = false;
            buttonEl.textContent = "Cancel Booking";
            alert(`Unable to cancel booking: ${err.message || "Server error"}`);
        }
    }

    /**
     * Fetch all bookings from GET /api/bookings.
     */
    async function loadBookings() {
        showLoading();

        try {
            const response = await window.api.getBookings();
            allBookings = (response && Array.isArray(response.data)) ? response.data : [];
            updateStatistics();
            renderBookings();
        } catch (err) {
            console.error("[Bookings] Failed to load:", err);
            showError(err.message);
        }
    }

    // --- Filter listener ---
    if (bookingFilter) {
        bookingFilter.addEventListener("change", () => {
            renderBookings();
        });
    }

    // --- Initialize ---
    loadBookings();
})();
