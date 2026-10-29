/**
 * public/js/event.js
 *
 * Eventify — Event Details Controller
 *
 * Reads event ID from URL query parameters, loads event data via window.api,
 * and renders details safely using DOM APIs.
 */

(function () {
    "use strict";

    const eventContent = document.getElementById("event-content");
    const urlParams = new URLSearchParams(window.location.search);
    const rawId = urlParams.get("id");

    /**
     * Format a date string into human-friendly long format (e.g., "Saturday, 15 January 2027").
     * @param {string} dateString
     * @returns {string}
     */
    function formatEventDate(dateString) {
        if (!dateString) return "Date TBA";
        try {
            const dateVal = dateString.includes("T") ? dateString : `${dateString}T12:00:00`;
            const d = new Date(dateVal);
            if (isNaN(d.getTime())) return dateString;
            return d.toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
            });
        } catch (_) {
            return dateString;
        }
    }

    /**
     * Sanitize image URLs to prevent javascript: or malformed CSS injection.
     * @param {string} url
     * @returns {string} Safe URL or fallback placeholder
     */
    function sanitizeImageUrl(url) {
        if (!url || typeof url !== "string") return "";
        const trimmed = url.trim();
        if (/^(https?:\/\/|\/|\.\/)/i.test(trimmed)) {
            return trimmed.replace(/['"()]/g, "");
        }
        return "";
    }

    /**
     * Display a loading indicator.
     */
    function showLoading() {
        if (!eventContent) return;
        eventContent.innerHTML = "";

        const p = document.createElement("p");
        p.className = "loading-message";
        p.textContent = "Loading event details...";
        eventContent.appendChild(p);
    }

    /**
     * Display an error or not-found state with appropriate navigation options.
     * @param {string} title
     * @param {string} message
     * @param {boolean} allowRetry
     */
    function showError(title, message, allowRetry = false) {
        if (!eventContent) return;
        eventContent.innerHTML = "";

        const box = document.createElement("div");
        box.className = "error-state";

        const h2 = document.createElement("h2");
        h2.textContent = title;

        const p = document.createElement("p");
        p.textContent = message;

        box.appendChild(h2);
        box.appendChild(p);

        if (allowRetry) {
            const retryBtn = document.createElement("button");
            retryBtn.className = "btn btn-primary";
            retryBtn.type = "button";
            retryBtn.textContent = "Retry";
            retryBtn.style.marginRight = "12px";
            retryBtn.addEventListener("click", () => {
                loadEvent();
            });
            box.appendChild(retryBtn);
        }

        const backLink = document.createElement("a");
        backLink.className = allowRetry ? "btn" : "btn btn-primary";
        backLink.href = "index.html#events";
        backLink.textContent = "← Browse all events";
        if (allowRetry) {
            backLink.style.backgroundColor = "var(--surface-light)";
            backLink.style.color = "var(--text)";
            backLink.style.border = "1px solid var(--border)";
        }
        box.appendChild(backLink);

        eventContent.appendChild(box);
    }

    /**
     * Helper to create a single fact block in the facts grid.
     * @param {string} labelText
     * @param {string} valueText
     * @returns {HTMLElement}
     */
    function createFactItem(labelText, valueText) {
        const item = document.createElement("div");
        item.className = "event-fact";

        const label = document.createElement("span");
        label.textContent = labelText;

        const value = document.createElement("strong");
        value.textContent = valueText;

        item.appendChild(label);
        item.appendChild(value);
        return item;
    }

    /**
     * Render the loaded event onto the page safely using DOM elements.
     * @param {Object} event
     */
    function renderEvent(event) {
        document.title = `${event.title || "Event Details"} | Eventify`;

        eventContent.innerHTML = "";

        // 1. Banner section
        const banner = document.createElement("section");
        banner.className = "event-banner";
        const safeImage = sanitizeImageUrl(event.image);
        if (safeImage) {
            banner.style.backgroundImage = `url('${safeImage}')`;
        }

        const bannerContent = document.createElement("div");
        bannerContent.className = "event-banner-content";

        const eyebrow = document.createElement("span");
        eyebrow.className = "eyebrow";
        eyebrow.textContent = (event.category || "General").toUpperCase();

        const title = document.createElement("h1");
        title.textContent = event.title || "Untitled Event";

        const dateCity = document.createElement("p");
        dateCity.textContent = `${formatEventDate(event.date)} · ${event.city || ""}`;

        bannerContent.appendChild(eyebrow);
        bannerContent.appendChild(title);
        bannerContent.appendChild(dateCity);
        banner.appendChild(bannerContent);

        // 2. Main layout grid
        const layout = document.createElement("div");
        layout.className = "event-layout";

        // 2a. Event main details
        const main = document.createElement("section");
        main.className = "event-main";

        const facts = document.createElement("div");
        facts.className = "event-facts";

        const venueCityText = event.venue && event.city
            ? `${event.venue}, ${event.city}`
            : event.venue || event.city || "TBA";

        const capacityNum = Number(event.capacity) || 0;

        facts.appendChild(createFactItem("Date", formatEventDate(event.date)));
        facts.appendChild(createFactItem("Location", venueCityText));
        facts.appendChild(createFactItem("Category", event.category || "General"));
        facts.appendChild(createFactItem("Listed capacity", `${capacityNum} tickets`));

        const aboutHeading = document.createElement("h2");
        aboutHeading.textContent = "About this event";

        const description = document.createElement("p");
        description.textContent = event.description || "No description provided.";

        main.appendChild(facts);
        main.appendChild(aboutHeading);
        main.appendChild(description);

        // 2b. Booking card aside
        const aside = document.createElement("aside");
        aside.className = "booking-card";

        const bookingEyebrow = document.createElement("p");
        bookingEyebrow.className = "eyebrow";
        bookingEyebrow.textContent = "YOUR NEXT EXPERIENCE";

        const priceP = document.createElement("p");
        priceP.className = "price";
        const priceNum = Number(event.price) || 0;
        priceP.textContent = priceNum === 0 ? "Free" : `₹${priceNum}`;

        const priceMuted = document.createElement("p");
        priceMuted.className = "muted";
        priceMuted.textContent = "Price per ticket";

        // Booking form
        const form = document.createElement("form");
        form.id = "booking-form";

        const qtyLabel = document.createElement("label");
        qtyLabel.htmlFor = "ticket-quantity";
        qtyLabel.textContent = "Number of tickets";

        const qtySelect = document.createElement("select");
        qtySelect.id = "ticket-quantity";
        qtySelect.name = "quantity";

        const maxTickets = Math.min(5, Math.max(1, capacityNum));
        for (let i = 1; i <= maxTickets; i++) {
            const opt = document.createElement("option");
            opt.value = String(i);
            opt.textContent = `${i} ticket${i === 1 ? "" : "s"}`;
            qtySelect.appendChild(opt);
        }

        const totalDiv = document.createElement("div");
        totalDiv.className = "booking-total";

        const totalSpan = document.createElement("span");
        totalSpan.textContent = "Total";

        const totalStrong = document.createElement("strong");
        totalStrong.id = "booking-total";
        totalStrong.textContent = priceNum === 0 ? "Free" : `₹${priceNum}`;

        totalDiv.appendChild(totalSpan);
        totalDiv.appendChild(totalStrong);

        const submitBtn = document.createElement("button");
        submitBtn.className = "btn btn-primary";
        submitBtn.type = "submit";
        submitBtn.textContent = "Continue to booking";

        const noteP = document.createElement("p");
        noteP.className = "booking-note";
        noteP.textContent = "Instant confirmation — view anytime in My Bookings.";

        const messageP = document.createElement("p");
        messageP.className = "booking-message";
        messageP.id = "booking-message";
        messageP.setAttribute("role", "status");
        messageP.setAttribute("aria-live", "polite");

        form.appendChild(qtyLabel);
        form.appendChild(qtySelect);
        form.appendChild(totalDiv);
        form.appendChild(submitBtn);
        form.appendChild(noteP);
        form.appendChild(messageP);

        aside.appendChild(bookingEyebrow);
        aside.appendChild(priceP);
        aside.appendChild(priceMuted);
        aside.appendChild(form);

        layout.appendChild(main);
        layout.appendChild(aside);

        eventContent.appendChild(banner);
        eventContent.appendChild(layout);

        // --- Interactive Form Handlers ---
        qtySelect.addEventListener("change", function () {
            const qty = Number(qtySelect.value) || 1;
            const total = priceNum * qty;
            totalStrong.textContent = total === 0 ? "Free" : `₹${total}`;
        });

        let isSubmitting = false;

        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            if (isSubmitting) return;

            const qty = Number(qtySelect.value);
            if (!Number.isInteger(qty) || qty < 1) {
                messageP.textContent = "Please select a valid ticket quantity (at least 1).";
                messageP.className = "booking-message error";
                return;
            }

            isSubmitting = true;
            submitBtn.disabled = true;
            submitBtn.textContent = "Reserving tickets...";
            messageP.textContent = "Connecting to server...";
            messageP.className = "booking-message";

            try {
                const response = await window.api.createBooking(event.id, qty);

                if (response && response.success && response.data) {
                    const booking = response.data;
                    messageP.className = "booking-message success";
                    messageP.innerHTML = "";

                    const successText = document.createElement("span");
                    const ticketsText = `${booking.quantity} ticket${booking.quantity === 1 ? "" : "s"}`;
                    const costText = booking.amount === 0 ? "Free" : `₹${Number(booking.amount).toLocaleString("en-IN")}`;
                    successText.textContent = `✓ Booking confirmed! Reference ID: ${booking.id} (${ticketsText}, ${costText}).`;

                    const viewLink = document.createElement("a");
                    viewLink.href = "bookings.html";
                    viewLink.textContent = "View in My Bookings →";
                    viewLink.style.display = "block";
                    viewLink.style.marginTop = "6px";
                    viewLink.style.color = "#86efac";
                    viewLink.style.fontWeight = "600";
                    viewLink.style.textDecoration = "underline";

                    messageP.appendChild(successText);
                    messageP.appendChild(viewLink);

                    noteP.textContent = `Reservation recorded for ${event.title}.`;
                    submitBtn.textContent = "Book More Tickets";
                    submitBtn.disabled = false;
                } else {
                    throw new Error((response && response.message) || "Booking confirmation failed.");
                }
            } catch (err) {
                console.error("[Booking] Creation failed:", err);
                messageP.className = "booking-message error";
                if (err.status === 401) {
                    messageP.innerHTML = "";
                    const authText = document.createElement("span");
                    authText.textContent = "Please sign in to reserve your tickets. ";
                    const loginLink = document.createElement("a");
                    loginLink.href = `login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
                    loginLink.textContent = "Sign In Now →";
                    loginLink.style.color = "#a78bfa";
                    loginLink.style.fontWeight = "600";
                    loginLink.style.textDecoration = "underline";
                    messageP.appendChild(authText);
                    messageP.appendChild(loginLink);
                } else {
                    messageP.textContent = err.message || "Unable to reserve tickets. Please try again.";
                }
                submitBtn.disabled = false;
                submitBtn.textContent = "Continue to booking";
            } finally {
                isSubmitting = false;
            }
        });
    }

    /**
     * Load event details from GET /api/events/:id.
     */
    async function loadEvent() {
        if (!rawId || isNaN(Number(rawId)) || Number(rawId) <= 0) {
            showError("Invalid Event ID", "No valid event ID was provided. Please choose an event from the catalog.", false);
            return;
        }

        showLoading();

        try {
            const response = await window.api.getEventById(rawId);
            if (response && response.data) {
                renderEvent(response.data);
            } else {
                showError("Event Not Found", "The requested event could not be found.", false);
            }
        } catch (err) {
            console.error("[Event Details] Failed to load event:", err);
            if (err.status === 404) {
                showError("Event Not Found", "This event does not exist in our catalog or has been removed.", false);
            } else {
                showError("Unable to Load Event", err.message || "Failed to connect to the server.", true);
            }
        }
    }

    // --- Initialize ---
    loadEvent();
})();
