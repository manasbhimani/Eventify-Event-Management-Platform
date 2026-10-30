/**
 * public/js/nav.js
 *
 * Eventify — Navigation Authentication State Synchronizer
 * Automatically checks auth state via window.api.getMe() and dynamically
 * updates navigation links, user identity badge, and logout action across all pages.
 */

(function () {
    "use strict";

    function escapeText(str) {
        const div = document.createElement("div");
        div.textContent = str || "";
        return div.innerHTML;
    }

    async function syncNavigation() {
        if (!window.api || typeof window.api.getMe !== "function") return;

        let currentUser = null;
        try {
            const res = await window.api.getMe();
            if (res && res.success && res.user) {
                currentUser = res.user;
            }
        } catch (_) {
            currentUser = null;
        }

        const navActions = document.querySelector(".nav-actions");
        const navLinks = document.querySelector(".nav-links");

        if (currentUser) {
            // Standardize navigation links for authenticated users
            if (navLinks) {
                // Ensure My Bookings link is present
                if (!navLinks.querySelector('a[href="bookings.html"]')) {
                    const bookingsLink = document.createElement("a");
                    bookingsLink.href = "bookings.html";
                    bookingsLink.textContent = "My Bookings";
                    navLinks.appendChild(bookingsLink);
                }

                // Add Organizer link for ORGANIZER and ADMIN
                if (currentUser.role === "ORGANIZER" || currentUser.role === "ADMIN") {
                    if (!navLinks.querySelector('a[href="organizer.html"]')) {
                        const orgLink = document.createElement("a");
                        orgLink.href = "organizer.html";
                        orgLink.textContent = "Organizer";
                        navLinks.appendChild(orgLink);
                    }
                }

                // Add Admin link for ADMIN
                if (currentUser.role === "ADMIN") {
                    if (!navLinks.querySelector('a[href="admin.html"]')) {
                        const adminLink = document.createElement("a");
                        adminLink.href = "admin.html";
                        adminLink.textContent = "Admin";
                        navLinks.appendChild(adminLink);
                    }
                }

                // If any stray login links exist in navLinks, remove them
                const strayLoginLink = navLinks.querySelector('a[href="login.html"]');
                if (strayLoginLink) {
                    strayLoginLink.remove();
                }
            }

            // User identity & logout action using CSS classes (no injected inline styles)
            const roleClass = (currentUser.role || "").toLowerCase();
            const userMarkup = `
                <span class="nav-user-info">
                    <span>Hi, <strong class="nav-user-name">${escapeText(currentUser.name)}</strong></span>
                    <span class="role-badge ${roleClass}">${escapeText(currentUser.role)}</span>
                </span>
                <button type="button" id="nav-logout-btn" class="nav-logout-btn" aria-label="Log out of Eventify">
                    Log out
                </button>
            `;

            if (navActions) {
                navActions.innerHTML = userMarkup;
            } else if (navLinks) {
                const container = document.createElement("div");
                container.className = "nav-actions";
                container.innerHTML = userMarkup;
                navLinks.parentNode.insertBefore(container, navLinks.nextSibling);
            }

            const logoutBtn = document.getElementById("nav-logout-btn");
            if (logoutBtn) {
                logoutBtn.addEventListener("click", async () => {
                    try {
                        logoutBtn.disabled = true;
                        logoutBtn.textContent = "Logging out...";
                        await window.api.logout();
                    } finally {
                        window.location.href = "index.html";
                    }
                });
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", syncNavigation);
    } else {
        syncNavigation();
    }
})();
