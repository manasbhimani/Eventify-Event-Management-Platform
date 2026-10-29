/**
 * public/js/app.js
 *
 * Eventify — Homepage Controller
 *
 * Manages category filtering, search input, and dynamic event rendering on the
 * discovery homepage. Integrates with the backend API via window.api.
 */

(function () {
    "use strict";

    const CATEGORY_ICONS = {
        All: "✦",
        Technology: "⌘",
        Music: "♫",
        Workshop: "✎",
        Sports: "⚽",
        Business: "◇",
        Conference: "🎤"
    };

    const grid = document.getElementById("event-grid");
    const searchInput = document.getElementById("search-input");
    const searchForm = document.getElementById("search-form");
    const resultsCount = document.getElementById("results-count");
    const categoryContainer = document.querySelector(".category-list");

    let selectedCategory = "All";
    let searchDebounceTimer = null;

    /**
     * Format a YYYY-MM-DD date string into human-friendly format (e.g., "15 Jan 2027").
     * @param {string} dateString
     * @returns {string}
     */
    function formatDate(dateString) {
        if (!dateString) return "Date TBA";
        try {
            const dateVal = dateString.includes("T") ? dateString : `${dateString}T12:00:00`;
            const d = new Date(dateVal);
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
     * Sanitize image URLs to prevent javascript: or malformed CSS injection.
     * @param {string} url
     * @returns {string} Safe URL or fallback placeholder
     */
    function sanitizeImageUrl(url) {
        if (!url || typeof url !== "string") return "";
        const trimmed = url.trim();
        if (/^(https?:\/\/|\/|\.\/)/i.test(trimmed)) {
            // Strip characters that could break out of CSS url('') context
            return trimmed.replace(/['"()]/g, "");
        }
        return "";
    }

    /**
     * Construct an event card DOM element safely using textContent.
     * @param {Object} event - Event record from API
     * @returns {HTMLElement} article.event-card element
     */
    function createEventCard(event) {
        const card = document.createElement("article");
        card.className = "event-card";

        // 1. Image container
        const imageDiv = document.createElement("div");
        imageDiv.className = "event-image";
        imageDiv.setAttribute("role", "img");
        imageDiv.setAttribute("aria-label", event.title || "Event Image");

        const safeImage = sanitizeImageUrl(event.image);
        if (safeImage) {
            imageDiv.style.backgroundImage = `url('${safeImage}')`;
        }

        const tagSpan = document.createElement("span");
        tagSpan.className = "event-tag";
        tagSpan.textContent = event.category || "General";
        imageDiv.appendChild(tagSpan);

        // 2. Info container
        const infoDiv = document.createElement("div");
        infoDiv.className = "event-info";

        const dateP = document.createElement("p");
        dateP.className = "event-date";
        dateP.textContent = formatDate(event.date);

        const titleH3 = document.createElement("h3");
        titleH3.textContent = event.title || "Untitled Event";

        const locationP = document.createElement("p");
        locationP.className = "event-location";
        const venue = (event.venue || "").trim();
        const city = (event.city || "").trim();
        locationP.textContent = venue && city ? `${venue} · ${city}` : venue || city || "Location TBA";

        // 3. Price & Action bottom row
        const bottomDiv = document.createElement("div");
        bottomDiv.className = "event-bottom";

        const priceP = document.createElement("p");
        priceP.className = "event-price";
        const priceNum = Number(event.price);
        if (priceNum === 0) {
            priceP.textContent = "Free";
        } else {
            priceP.textContent = `₹${priceNum}`;
        }

        const smallPerTicket = document.createElement("small");
        smallPerTicket.textContent = " per ticket";
        priceP.appendChild(smallPerTicket);

        const viewLink = document.createElement("a");
        viewLink.className = "btn btn-primary";
        viewLink.href = `event.html?id=${encodeURIComponent(event.id)}`;
        viewLink.textContent = "View event ↗";

        bottomDiv.appendChild(priceP);
        bottomDiv.appendChild(viewLink);

        // Assemble card
        infoDiv.appendChild(dateP);
        infoDiv.appendChild(titleH3);
        infoDiv.appendChild(locationP);
        infoDiv.appendChild(bottomDiv);

        card.appendChild(imageDiv);
        card.appendChild(infoDiv);

        return card;
    }

    /**
     * Show loading placeholder in the event grid.
     */
    function showLoadingState() {
        grid.innerHTML = "";
        const box = document.createElement("div");
        box.className = "empty-state";

        const p = document.createElement("p");
        p.textContent = "Loading events...";
        box.appendChild(p);

        grid.appendChild(box);
        if (resultsCount) {
            resultsCount.textContent = "Loading...";
        }
    }

    /**
     * Show empty state when no events match the search/category criteria.
     */
    function showEmptyState() {
        grid.innerHTML = "";
        const box = document.createElement("div");
        box.className = "empty-state";

        const h3 = document.createElement("h3");
        h3.textContent = "No events found";

        const p = document.createElement("p");
        p.textContent = "Try another search or select a different category.";

        box.appendChild(h3);
        box.appendChild(p);
        grid.appendChild(box);

        if (resultsCount) {
            resultsCount.textContent = "0 events";
        }
    }

    /**
     * Show error state with a retry button when the API request fails.
     * @param {string} errorMessage
     */
    function showErrorState(errorMessage) {
        grid.innerHTML = "";
        const box = document.createElement("div");
        box.className = "empty-state";

        const h3 = document.createElement("h3");
        h3.textContent = "Unable to load events";

        const p = document.createElement("p");
        p.textContent = errorMessage || "Failed to connect to the server. Please check your connection.";

        const retryBtn = document.createElement("button");
        retryBtn.className = "btn btn-primary";
        retryBtn.type = "button";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => {
            loadEvents();
        });

        box.appendChild(h3);
        box.appendChild(p);
        box.appendChild(retryBtn);
        grid.appendChild(box);

        if (resultsCount) {
            resultsCount.textContent = "Error loading events";
        }
    }

    /**
     * Load events from GET /api/events with current filter & query.
     */
    async function loadEvents() {
        showLoadingState();

        const query = searchInput ? searchInput.value.trim() : "";

        try {
            const response = await window.api.getEvents({
                category: selectedCategory,
                search: query
            });

            const events = (response && Array.isArray(response.data)) ? response.data : [];

            if (events.length === 0) {
                showEmptyState();
                return;
            }

            grid.innerHTML = "";
            const fragment = document.createDocumentFragment();
            events.forEach(event => {
                fragment.appendChild(createEventCard(event));
            });
            grid.appendChild(fragment);

            if (resultsCount) {
                resultsCount.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
            }
        } catch (err) {
            console.error("[Events] Failed to load:", err);
            showErrorState(err.message);
        }
    }

    /**
     * Handle category button click.
     * @param {string} categoryName
     * @param {HTMLElement} clickedButton
     */
    function handleCategoryClick(categoryName, clickedButton) {
        selectedCategory = categoryName;

        const allButtons = categoryContainer ? categoryContainer.querySelectorAll(".category") : [];
        allButtons.forEach(btn => {
            const isActive = btn === clickedButton;
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-pressed", String(isActive));
        });

        loadEvents();
    }

    /**
     * Render category buttons dynamically from API data.
     * @param {Array<{id: number, name: string}>} categories
     */
    function renderCategoryButtons(categories) {
        if (!categoryContainer) return;

        categoryContainer.innerHTML = "";

        // 1. "All events" button
        const allBtn = document.createElement("button");
        allBtn.className = "category active";
        allBtn.dataset.category = "All";
        allBtn.setAttribute("aria-pressed", "true");
        allBtn.textContent = `${CATEGORY_ICONS.All} All events`;
        allBtn.addEventListener("click", () => handleCategoryClick("All", allBtn));
        categoryContainer.appendChild(allBtn);

        // 2. Individual category buttons
        categories.forEach(cat => {
            const btn = document.createElement("button");
            btn.className = "category";
            btn.dataset.category = cat.name;
            btn.setAttribute("aria-pressed", "false");
            const icon = CATEGORY_ICONS[cat.name] || "✦";
            btn.textContent = `${icon} ${cat.name}`;
            btn.addEventListener("click", () => handleCategoryClick(cat.name, btn));
            categoryContainer.appendChild(btn);
        });
    }

    /**
     * Fallback listener attachment if categories failed to load from API.
     */
    function attachFallbackCategoryListeners() {
        if (!categoryContainer) return;
        const buttons = categoryContainer.querySelectorAll(".category");
        buttons.forEach(btn => {
            btn.addEventListener("click", () => {
                handleCategoryClick(btn.dataset.category || "All", btn);
            });
        });
    }

    /**
     * Fetch categories from GET /api/categories.
     */
    async function loadCategories() {
        try {
            const response = await window.api.getCategories();
            if (response && Array.isArray(response.data) && response.data.length > 0) {
                renderCategoryButtons(response.data);
            } else {
                attachFallbackCategoryListeners();
            }
        } catch (err) {
            console.warn("[Categories] Could not load from API, keeping fallback buttons:", err.message);
            attachFallbackCategoryListeners();
        }
    }

    // --- Search input & form listeners ---
    if (searchForm) {
        searchForm.addEventListener("submit", event => {
            event.preventDefault();
            clearTimeout(searchDebounceTimer);
            loadEvents();
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                loadEvents();
            }, 300);
        });
    }

    // --- Initialize ---
    loadCategories();
    loadEvents();
})();
