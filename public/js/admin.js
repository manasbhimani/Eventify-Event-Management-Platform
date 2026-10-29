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
            dateP.textContent = `Date: ${formatEventDate(event.date)}`;

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
