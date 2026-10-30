/**
 * public/js/admin.js
 *
 * Eventify — Administrator Dashboard Controller
 *
 * Connects the admin dashboard to:
 *   - GET /api/auth/me      — Verifies administrator identity & permissions.
 *   - GET /api/admin/stats  — Loads live platform statistics (users, events, bookings, revenue).
 *   - GET /api/events       — Loads platform event catalog.
 *   - GET /api/categories   — Loads real event categories.
 */

(function () {
    "use strict";

    let currentUser = null;
    let liveStats = null;
    let allEvents = [];
    let allCategories = [];
    let allBookings = [];

    const adminBookingsTableEl = document.getElementById("admin-bookings-table");
    const adminBookingFilterEl = document.getElementById("admin-booking-filter");
    const adminBookingMsgEl = document.getElementById("admin-booking-message");

    // DOM Elements
    const containerEl = document.querySelector(".admin-container");
    const totalUsersEl = document.getElementById("total-users");
    const totalEventsEl = document.getElementById("total-events");
    const totalBookingsEl = document.getElementById("total-bookings");
    const totalRevenueEl = document.getElementById("total-revenue");

    const usersTableEl = document.getElementById("users-table");
    const userSearchInput = document.getElementById("user-search");
    const adminEventsEl = document.getElementById("admin-events");
    const eventStatusFilter = document.getElementById("event-status-filter");
    const categoryListEl = document.getElementById("category-list");
    const categoryFormEl = document.getElementById("category-form");
    const categoryMsgEl = document.getElementById("category-message");

    // =======================================================================
    // HELPERS
    // =======================================================================

    function escapeText(value) {
        return value ? String(value) : "";
    }

    function formatEventDate(dateString) {
        if (!dateString) return "Date TBA";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
            });
        } catch (_) {
            return dateString;
        }
    }

    function formatRupees(amount) {
        const num = Number(amount) || 0;
        return "₹" + num.toLocaleString("en-IN");
    }

    // =======================================================================
    // AUTHORIZATION & ACCESS CONTROL
    // =======================================================================

    function renderAccessDenied(title, message, buttonText, buttonHref) {
        if (!containerEl) return;
        containerEl.innerHTML = "";

        const card = document.createElement("section");
        card.className = "admin-section";
        card.style.maxWidth = "600px";
        card.style.margin = "60px auto";
        card.style.textAlign = "center";
        card.style.padding = "45px 30px";

        const icon = document.createElement("div");
        icon.style.fontSize = "38px";
        icon.style.marginBottom = "16px";
        icon.textContent = "🛡️";

        const h1 = document.createElement("h1");
        h1.style.fontSize = "26px";
        h1.style.marginBottom = "14px";
        h1.style.color = "#f4f4fb";
        h1.textContent = title;

        const p = document.createElement("p");
        p.className = "muted";
        p.style.marginBottom = "26px";
        p.textContent = message;

        const actionBtn = document.createElement("a");
        actionBtn.className = "primary-button";
        actionBtn.style.display = "inline-block";
        actionBtn.style.textDecoration = "none";
        actionBtn.href = buttonHref;
        actionBtn.textContent = buttonText;

        card.appendChild(icon);
        card.appendChild(h1);
        card.appendChild(p);
        card.appendChild(actionBtn);
        containerEl.appendChild(card);
    }

    async function checkAuthorization() {
        if (!window.api || typeof window.api.getMe !== "function") {
            renderAccessDenied(
                "API Client Missing",
                "Frontend API client is not loaded. Please refresh the page.",
                "Reload Page",
                "admin.html"
            );
            return false;
        }

        try {
            const res = await window.api.getMe();
            if (res && res.success && res.user) {
                currentUser = res.user;

                // Check role: strictly ADMIN only
                if (currentUser.role !== "ADMIN") {
                    renderAccessDenied(
                        "Administrator Role Required",
                        `Your account (${currentUser.email}) has the ${currentUser.role} role. Platform administration is restricted strictly to Administrator accounts.`,
                        "← Back to Events",
                        "index.html"
                    );
                    return false;
                }

                return true;
            } else {
                throw new Error("Unauthenticated");
            }
        } catch (_) {
            renderAccessDenied(
                "Sign In Required",
                "Please sign in with an administrator account to access platform management.",
                "Sign In as Admin →",
                "login.html?redirect=admin.html"
            );
            return false;
        }
    }

    // =======================================================================
    // ADMIN STATISTICS INTEGRATION (GET /api/admin/stats)
    // =======================================================================

    async function loadAdminStats() {
        if (totalUsersEl) totalUsersEl.textContent = "...";
        if (totalEventsEl) totalEventsEl.textContent = "...";
        if (totalBookingsEl) totalBookingsEl.textContent = "...";
        if (totalRevenueEl) totalRevenueEl.textContent = "...";

        try {
            const res = await window.api.getAdminStats();
            if (res && res.success && res.stats) {
                liveStats = res.stats;

                if (totalUsersEl) {
                    totalUsersEl.textContent = Number(liveStats.totalUsers || 0).toLocaleString("en-IN");
                }
                if (totalEventsEl) {
                    totalEventsEl.textContent = Number(liveStats.totalEvents || 0).toLocaleString("en-IN");
                }
                if (totalBookingsEl) {
                    totalBookingsEl.textContent = Number(liveStats.totalBookings || 0).toLocaleString("en-IN");
                }
                if (totalRevenueEl) {
                    totalRevenueEl.textContent = formatRupees(liveStats.revenue);
                }
            } else {
                throw new Error("Unable to parse statistics.");
            }
        } catch (err) {
            console.error("[Admin Stats] Failed to load stats:", err);
            if (totalUsersEl) totalUsersEl.textContent = "Error";
            if (totalEventsEl) totalEventsEl.textContent = "Error";
            if (totalBookingsEl) totalBookingsEl.textContent = "Error";
            if (totalRevenueEl) totalRevenueEl.textContent = "Error";
        }
    }

    // =======================================================================
    // EVENT CATALOG INTEGRATION (GET /api/events)
    // =======================================================================

    function renderAdminEvents() {
        if (!adminEventsEl) return;
        adminEventsEl.innerHTML = "";

        const selectedStatus = eventStatusFilter ? eventStatusFilter.value : "ALL";

        const filtered = allEvents.filter(e => {
            if (selectedStatus === "ALL") return true;
            return (e.status || "PUBLISHED").toUpperCase() === selectedStatus.toUpperCase();
        });

        if (filtered.length === 0) {
            const emptyDiv = document.createElement("div");
            emptyDiv.className = "empty-state";
            emptyDiv.textContent = selectedStatus === "ALL"
                ? "No events found in the catalog."
                : `No events match the "${selectedStatus}" filter.`;
            adminEventsEl.appendChild(emptyDiv);
            return;
        }

        const fragment = document.createDocumentFragment();

        filtered.forEach(event => {
            const card = document.createElement("article");
            card.className = "admin-event-card";

            const topDiv = document.createElement("div");
            topDiv.className = "admin-event-top";

            const titleGroup = document.createElement("div");
            const h3 = document.createElement("h3");
            h3.textContent = escapeText(event.title);

            const categoryP = document.createElement("p");
            categoryP.textContent = `Category: ${escapeText(event.category || "General")}`;

            titleGroup.appendChild(h3);
            titleGroup.appendChild(categoryP);

            const statusClass = (event.status || "published").toLowerCase();
            const statusSpan = document.createElement("span");
            statusSpan.className = `event-status ${statusClass}`;
            statusSpan.textContent = escapeText(event.status || "PUBLISHED");

            topDiv.appendChild(titleGroup);
            topDiv.appendChild(statusSpan);

            const dateP = document.createElement("p");
            const timePart = event.time ? ` at ${event.time}` : "";
            dateP.textContent = `Date: ${formatEventDate(event.date)}${timePart}`;

            const venueCity = event.venue && event.city
                ? `${event.venue}, ${event.city}`
                : event.venue || event.city || "Venue TBA";
            const locationP = document.createElement("p");
            locationP.textContent = `Location: ${venueCity}`;

            const priceP = document.createElement("p");
            const priceNum = Number(event.price) || 0;
            priceP.textContent = `Price: ${priceNum === 0 ? "Free" : formatRupees(priceNum)} · Capacity: ${Number(event.capacity || 0).toLocaleString("en-IN")}`;

            const actionsDiv = document.createElement("div");
            actionsDiv.className = "admin-event-actions";

            const viewLink = document.createElement("a");
            viewLink.className = "admin-action";
            viewLink.href = `event.html?id=${encodeURIComponent(event.id)}`;
            viewLink.textContent = "View Public Details →";

            actionsDiv.appendChild(viewLink);

            card.appendChild(topDiv);
            card.appendChild(dateP);
            card.appendChild(locationP);
            card.appendChild(priceP);
            card.appendChild(actionsDiv);

            fragment.appendChild(card);
        });

        adminEventsEl.appendChild(fragment);
    }

    async function loadAdminEvents() {
        if (!adminEventsEl) return;
        adminEventsEl.innerHTML = "";

        const loadingDiv = document.createElement("div");
        loadingDiv.className = "empty-state";
        loadingDiv.textContent = "Loading event catalog...";
        adminEventsEl.appendChild(loadingDiv);

        try {
            const res = await window.api.getEvents();
            allEvents = (res && Array.isArray(res.data)) ? res.data : [];
            renderAdminEvents();
        } catch (err) {
            adminEventsEl.innerHTML = "";
            const errDiv = document.createElement("div");
            errDiv.className = "empty-state";
            errDiv.style.color = "#f87171";
            errDiv.textContent = `Unable to load events: ${err.message || "Server error"}`;
            adminEventsEl.appendChild(errDiv);
        }
    }



    // =======================================================================
    // ADMIN BOOKING MANAGEMENT (GET /api/bookings & POST /api/bookings/:id/cancel)
    // =======================================================================

    function renderAdminBookings() {
        if (!adminBookingsTableEl) return;
        adminBookingsTableEl.innerHTML = "";

        const selectedStatus = adminBookingFilterEl ? adminBookingFilterEl.value : "ALL";

        const filtered = allBookings.filter(b => {
            if (selectedStatus === "ALL") return true;
            return (b.status || "CONFIRMED").toUpperCase() === selectedStatus.toUpperCase();
        });

        if (filtered.length === 0) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 8;
            td.className = "table-empty-cell";
            td.textContent = (selectedStatus === "ALL")
                ? "No bookings found in the platform database."
                : `No bookings match the "${selectedStatus}" status filter.`;
            tr.appendChild(td);
            adminBookingsTableEl.appendChild(tr);
            return;
        }

        const fragment = document.createDocumentFragment();

        filtered.forEach(booking => {
            const tr = document.createElement("tr");

            // 1. Reference
            const refTd = document.createElement("td");
            const refStrong = document.createElement("strong");
            refStrong.textContent = escapeText(booking.id);
            refTd.appendChild(refStrong);
            tr.appendChild(refTd);

            // 2. Attendee
            const userTd = document.createElement("td");
            userTd.textContent = booking.userId ? `User #${booking.userId}` : "Attendee";
            tr.appendChild(userTd);

            // 3. Event
            const eventTd = document.createElement("td");
            eventTd.textContent = escapeText(booking.title || "Untitled Event");
            tr.appendChild(eventTd);

            // 4. Quantity
            const qtyTd = document.createElement("td");
            qtyTd.textContent = Number(booking.quantity || 1).toLocaleString("en-IN");
            tr.appendChild(qtyTd);

            // 5. Amount
            const amtTd = document.createElement("td");
            amtTd.textContent = formatRupees(booking.amount);
            tr.appendChild(amtTd);

            // 6. Date
            const dateTd = document.createElement("td");
            dateTd.textContent = formatEventDate(booking.date);
            tr.appendChild(dateTd);

            // 7. Status
            const statusTd = document.createElement("td");
            const statusSpan = document.createElement("span");
            const statusLower = (booking.status || "confirmed").toLowerCase();
            statusSpan.className = `booking-status ${statusLower}`;
            statusSpan.textContent = escapeText(booking.status || "CONFIRMED");
            statusTd.appendChild(statusSpan);
            tr.appendChild(statusTd);

            // 8. Action
            const actionTd = document.createElement("td");
            if (booking.status === "CONFIRMED") {
                const cancelBtn = document.createElement("button");
                cancelBtn.type = "button";
                cancelBtn.className = "admin-action danger";
                cancelBtn.textContent = "Cancel Booking";
                cancelBtn.setAttribute("aria-label", `Cancel booking ${escapeText(booking.id)}`);
                cancelBtn.addEventListener("click", () => handleAdminCancelBooking(booking));
                actionTd.appendChild(cancelBtn);
            } else {
                const mutedSpan = document.createElement("span");
                mutedSpan.className = "muted";
                mutedSpan.textContent = "—";
                actionTd.appendChild(mutedSpan);
            }
            tr.appendChild(actionTd);

            fragment.appendChild(tr);
        });

        adminBookingsTableEl.appendChild(fragment);
    }

    async function handleAdminCancelBooking(booking) {
        const confirmed = window.confirm(
            `Are you sure you want to cancel booking ${booking.id} (${booking.title})?\n\nThis will restore ticket capacity and adjust platform revenue.`
        );
        if (!confirmed) return;

        if (adminBookingMsgEl) {
            adminBookingMsgEl.textContent = `Cancelling booking ${booking.id}...`;
            adminBookingMsgEl.style.color = "#c4b5fd";
        }

        try {
            const res = await window.api.cancelBooking(booking.id);
            if (res && res.success) {
                if (adminBookingMsgEl) {
                    adminBookingMsgEl.textContent = `✓ Booking ${booking.id} cancelled successfully.`;
                    adminBookingMsgEl.style.color = "#4ade80";
                }
                // Refresh bookings table and platform statistics
                await Promise.all([
                    loadAdminBookings(),
                    loadAdminStats()
                ]);
            } else {
                throw new Error((res && res.message) || "Cancellation could not be completed.");
            }
        } catch (err) {
            if (adminBookingMsgEl) {
                adminBookingMsgEl.textContent = `Failed to cancel booking: ${err.message || "Server error"}`;
                adminBookingMsgEl.style.color = "#f87171";
            }
        }
    }

    async function loadAdminBookings() {
        if (!adminBookingsTableEl) return;
        adminBookingsTableEl.innerHTML = "";

        const loadingTr = document.createElement("tr");
        const loadingTd = document.createElement("td");
        loadingTd.colSpan = 8;
        loadingTd.className = "table-loading-cell";
        loadingTd.textContent = "Loading platform bookings from Oracle...";
        loadingTr.appendChild(loadingTd);
        adminBookingsTableEl.appendChild(loadingTr);

        try {
            const res = await window.api.getBookings();
            allBookings = (res && Array.isArray(res.data)) ? res.data : [];
            renderAdminBookings();
        } catch (err) {
            adminBookingsTableEl.innerHTML = "";
            const errTr = document.createElement("tr");
            const errTd = document.createElement("td");
            errTd.colSpan = 8;
            errTd.className = "table-error-cell";
            errTd.textContent = `Unable to load bookings: ${err.message || "Server error"}`;
            errTr.appendChild(errTd);
            adminBookingsTableEl.appendChild(errTr);
        }
    }

// =======================================================================
    // CATEGORY MANAGEMENT INTEGRATION (GET /api/categories)
    // =======================================================================

    function renderCategories() {
        if (!categoryListEl) return;
        categoryListEl.innerHTML = "";

        if (allCategories.length === 0) {
            const emptyP = document.createElement("p");
            emptyP.className = "muted";
            emptyP.textContent = "No categories available.";
            categoryListEl.appendChild(emptyP);
            return;
        }

        const fragment = document.createDocumentFragment();

        allCategories.forEach(cat => {
            const chip = document.createElement("div");
            chip.className = "category-chip";

            const nameSpan = document.createElement("span");
            nameSpan.textContent = typeof cat === "string" ? cat : (cat.name || "");

            chip.appendChild(nameSpan);
            fragment.appendChild(chip);
        });

        categoryListEl.appendChild(fragment);
    }

    async function loadCategories() {
        try {
            const res = await window.api.getCategories();
            allCategories = (res && Array.isArray(res.data)) ? res.data : [];
            renderCategories();
        } catch (err) {
            console.error("[Categories] Failed to load:", err);
        }
    }

    // =======================================================================
    // USER MANAGEMENT & LIMITATION REPORTING
    // =======================================================================

    function renderUserSectionState() {
        if (!usersTableEl) return;
        usersTableEl.innerHTML = "";

        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.style.textAlign = "center";
        cell.style.padding = "30px 18px";
        cell.style.color = "#aaa8c3";
        cell.style.lineHeight = "1.6";

        const countText = liveStats ? `Live registered accounts count: ${liveStats.totalUsers}. ` : "";
        cell.textContent = `${countText}Granular user directory listing (GET /api/admin/users) is deferred to future backend implementation. Platform aggregate metrics are loaded live above.`;

        row.appendChild(cell);
        usersTableEl.appendChild(row);
    }

    // =======================================================================
    // LISTENERS & INITIALIZATION
    // =======================================================================

    function initListeners() {
        if (eventStatusFilter) {
            eventStatusFilter.addEventListener("change", renderAdminEvents);
        }

        if (adminBookingFilterEl) {
            adminBookingFilterEl.addEventListener("change", renderAdminBookings);
        }

        if (categoryFormEl) {
            categoryFormEl.addEventListener("submit", (e) => {
                e.preventDefault();
                if (categoryMsgEl) {
                    categoryMsgEl.textContent = "Notice: Category creation endpoint (POST /api/categories) is deferred to future backend phases.";
                    categoryMsgEl.style.color = "#c4b5fd";
                }
            });
        }

        if (userSearchInput) {
            userSearchInput.addEventListener("input", () => {
                if (usersTableEl) {
                    const cell = usersTableEl.querySelector("td");
                    if (cell) {
                        cell.textContent = "Live user directory filtering requires the deferred GET /api/admin/users endpoint. Aggregate user count is displayed above.";
                    }
                }
            });
        }
    }

    async function init() {
        const authorized = await checkAuthorization();
        if (authorized) {
            initListeners();
            await Promise.all([
                loadAdminStats(),
                loadAdminEvents(),
                loadAdminBookings(),
                loadCategories()
            ]);
            renderUserSectionState();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
