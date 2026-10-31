/**
 * public/js/organizer.js
 *
 * Eventify — Organizer Dashboard Controller
 *
 * Connects the organizer dashboard to:
 *   - GET  /api/auth/me  — Verifies organizer/admin identity & authorization.
 *   - GET  /api/events   — Loads live event catalog and calculates metrics.
 *   - POST /api/events   — Creates a new event with CSRF protection and validation.
 */

(function () {
    "use strict";

    let currentUser = null;
    let allEvents = [];
    let availableCategories = [];
    let isSubmitting = false;

    // DOM Elements
    const containerEl = document.querySelector(".organizer-container");
    const openFormBtn = document.getElementById("open-event-form");
    const closeFormBtn = document.getElementById("close-event-form");
    const eventFormSection = document.getElementById("event-form-section");
    const createEventForm = document.getElementById("create-event-form");
    const organizerEventsEl = document.getElementById("organizer-events");
    const statusFilter = document.getElementById("status-filter");
    const formMessageEl = document.getElementById("event-form-message");

    // Edit Event Modal DOM Elements
    const editModalBackdrop = document.getElementById("edit-modal-backdrop");
    const closeEditModalBtn = document.getElementById("close-edit-modal");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");
    const editEventForm = document.getElementById("edit-event-form");
    const editLockedNotice = document.getElementById("edit-locked-notice");
    const editLockedNoticeText = document.getElementById("edit-locked-notice-text");
    const editFormMessageEl = document.getElementById("edit-form-message");
    const saveEditBtn = document.getElementById("save-edit-btn");

    const editEventIdInput = document.getElementById("edit-event-id");
    const editTitleInput = document.getElementById("edit-event-title");
    const editCategorySelect = document.getElementById("edit-event-category");
    const editCityInput = document.getElementById("edit-event-city");
    const editVenueInput = document.getElementById("edit-event-venue");
    const editDateInput = document.getElementById("edit-event-date");
    const editTimeInput = document.getElementById("edit-event-time");
    const editPriceInput = document.getElementById("edit-event-price");
    const editCapacityInput = document.getElementById("edit-event-capacity");
    const editImageInput = document.getElementById("edit-event-image");
    const editDescriptionInput = document.getElementById("edit-event-description");

    let isSubmittingEdit = false;

    // Cancel Event Modal DOM Elements
    const cancelModalBackdrop = document.getElementById("cancel-modal-backdrop");
    const closeCancelModalBtn = document.getElementById("close-cancel-modal");
    const abortCancelBtn = document.getElementById("abort-cancel-btn");
    const cancelEventForm = document.getElementById("cancel-event-form");
    const cancelEventIdInput = document.getElementById("cancel-event-id");
    const cancelReasonInput = document.getElementById("cancel-event-reason");
    const cancelFormMessageEl = document.getElementById("cancel-form-message");
    const confirmCancelBtn = document.getElementById("confirm-cancel-btn");

    let isSubmittingCancel = false;

    const statEventsEl = document.getElementById("stat-events");
    const statTicketsEl = document.getElementById("stat-tickets");
    const statRegistrationsEl = document.getElementById("stat-registrations");
    const statValueEl = document.getElementById("stat-value");

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

    function setMessage(element, text, isError) {
        if (!element) return;
        element.textContent = text;
        element.style.color = isError ? "#f87171" : "#4ade80";
    }

    // =======================================================================
    // AUTHORIZATION & ACCESS CONTROL
    // =======================================================================

    function renderAccessDenied(title, message, buttonText, buttonHref) {
        if (!containerEl) return;
        containerEl.innerHTML = "";

        const card = document.createElement("section");
        card.className = "event-form-section";
        card.style.maxWidth = "600px";
        card.style.margin = "60px auto";
        card.style.textAlign = "center";
        card.style.padding = "45px 30px";

        const icon = document.createElement("div");
        icon.style.fontSize = "38px";
        icon.style.marginBottom = "16px";
        icon.textContent = "🔒";

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
                "organizer.html"
            );
            return false;
        }

        try {
            const res = await window.api.getMe();
            if (res && res.success && res.user) {
                currentUser = res.user;

                // Check role: must be ORGANIZER or ADMIN
                if (currentUser.role !== "ORGANIZER" && currentUser.role !== "ADMIN") {
                    renderAccessDenied(
                        "Organizer Role Required",
                        `Your account (${currentUser.email}) is registered as an ${currentUser.role}. Creating and managing events requires the Organizer or Administrator role.`,
                        "← Explore Events",
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
                "Please sign in with an organizer or administrator account to access the Organizer Workspace.",
                "Sign In to Eventify →",
                "login.html?redirect=organizer.html"
            );
            return false;
        }
    }

    // =======================================================================
    // STATISTICS CALCULATION
    // =======================================================================

    function updateStatistics() {
        // Calculate statistics using only events where creatorId === currentUser.id
        const myEvents = (currentUser && currentUser.id)
            ? allEvents.filter(e => Number(e.creatorId) === Number(currentUser.id))
            : [];

        if (statEventsEl) {
            statEventsEl.textContent = myEvents.length.toLocaleString("en-IN");
        }

        const totalCapacity = myEvents
            .filter(e => e.status !== "CANCELLED")
            .reduce((sum, e) => sum + (Number(e.capacity) || 0), 0);

        if (statTicketsEl) {
            statTicketsEl.textContent = totalCapacity.toLocaleString("en-IN");
        }

        // Display clear "Not available yet" state for organizer-specific registrations
        if (statRegistrationsEl) {
            statRegistrationsEl.textContent = "Not available yet";
            statRegistrationsEl.title = "Organizer-specific registration aggregates are not yet supported by the backend.";
            statRegistrationsEl.classList.add("stat-unavailable");
        }

        const potentialValue = myEvents
            .filter(e => e.status === "PUBLISHED")
            .reduce((sum, e) => sum + ((Number(e.price) || 0) * (Number(e.capacity) || 0)), 0);

        if (statValueEl) {
            statValueEl.textContent = formatRupees(potentialValue);
        }
    }

    // =======================================================================
    // EVENT RENDERING (SAFE DOM METHODS)
    // =======================================================================

    function renderEvents() {
        if (!organizerEventsEl) return;
        organizerEventsEl.innerHTML = "";

        const selectedStatus = statusFilter ? statusFilter.value : "ALL";

        const filtered = allEvents.filter(e => {
            if (selectedStatus === "ALL") return true;
            return (e.status || "PUBLISHED").toUpperCase() === selectedStatus.toUpperCase();
        });

        if (filtered.length === 0) {
            const emptyBox = document.createElement("div");
            emptyBox.className = "empty-events";
            const emptyMsg = document.createElement("p");
            emptyMsg.textContent = selectedStatus === "ALL"
                ? "No events found in the platform catalog."
                : `No events match the "${selectedStatus}" status filter.`;
            emptyBox.appendChild(emptyMsg);
            organizerEventsEl.appendChild(emptyBox);
            return;
        }

        const fragment = document.createDocumentFragment();

        filtered.forEach(event => {
            const card = document.createElement("article");
            card.className = "managed-event";

            // Top section
            const topDiv = document.createElement("div");
            topDiv.className = "managed-event-top";

            const headingGroup = document.createElement("div");
            const titleEl = document.createElement("h3");
            titleEl.textContent = escapeText(event.title);

            const categoryEl = document.createElement("p");
            categoryEl.className = "event-category";
            categoryEl.textContent = escapeText(event.category || "General");

            headingGroup.appendChild(titleEl);
            headingGroup.appendChild(categoryEl);

            const badgesGroup = document.createElement("div");
            badgesGroup.style.display = "flex";
            badgesGroup.style.alignItems = "center";
            badgesGroup.style.gap = "8px";

            // Status Badge
            const statusSpan = document.createElement("span");
            const statusLower = (event.status || "published").toLowerCase();
            statusSpan.className = `event-status ${statusLower}`;
            statusSpan.textContent = (event.status || "PUBLISHED").toUpperCase();

            // Ownership Badge (strictly verifies API creatorId)
            const isOwned = currentUser && event.creatorId && Number(event.creatorId) === Number(currentUser.id);
            const ownerBadge = document.createElement("span");
            ownerBadge.className = `owner-badge ${isOwned ? "owned" : "catalog"}`;
            ownerBadge.textContent = isOwned ? "Created by You" : "Catalog Listing";

            badgesGroup.appendChild(ownerBadge);
            badgesGroup.appendChild(statusSpan);

            topDiv.appendChild(headingGroup);
            topDiv.appendChild(badgesGroup);

            // Description
            const descEl = document.createElement("p");
            descEl.className = "event-description";
            descEl.textContent = escapeText(event.description || "No description provided.");

            // Metadata
            const metaDiv = document.createElement("div");
            metaDiv.className = "event-meta";

            const dateSpan = document.createElement("span");
            const timeSuffix = event.time ? ` · 🕒 ${event.time}` : "";
            dateSpan.textContent = `📅 ${formatEventDate(event.date)}${timeSuffix}`;

            const venueSpan = document.createElement("span");
            const venueCity = event.venue && event.city
                ? `${event.venue}, ${event.city}`
                : event.venue || event.city || "Venue TBA";
            venueSpan.textContent = `📍 ${venueCity}`;

            const priceSpan = document.createElement("span");
            const priceNum = Number(event.price) || 0;
            priceSpan.textContent = `🎟️ ${priceNum === 0 ? "Free" : formatRupees(priceNum)} per ticket`;

            const capacitySpan = document.createElement("span");
            capacitySpan.textContent = `👥 ${Number(event.capacity || 0).toLocaleString("en-IN")} total capacity`;

            metaDiv.appendChild(dateSpan);
            metaDiv.appendChild(venueSpan);
            metaDiv.appendChild(priceSpan);
            metaDiv.appendChild(capacitySpan);

            // Actions
            const actionsDiv = document.createElement("div");
            actionsDiv.className = "event-actions";

            const viewLink = document.createElement("a");
            viewLink.className = "event-action";
            viewLink.href = `event.html?id=${encodeURIComponent(event.id)}`;
            viewLink.textContent = "View Public Page →";
            actionsDiv.appendChild(viewLink);

            if (isOwned && event.status !== "CANCELLED" && event.status !== "COMPLETED") {
                const editBtn = document.createElement("button");
                editBtn.type = "button";
                editBtn.className = "event-action edit-event-btn";
                editBtn.textContent = "✏️ Edit Event";
                editBtn.addEventListener("click", () => openEditModal(event.id));
                actionsDiv.appendChild(editBtn);

                const cancelBtn = document.createElement("button");
                cancelBtn.type = "button";
                cancelBtn.className = "event-action cancel-event-btn";
                cancelBtn.textContent = "🚫 Cancel Event";
                cancelBtn.addEventListener("click", () => openCancelModal(event));
                actionsDiv.appendChild(cancelBtn);
            }

            card.appendChild(topDiv);
            card.appendChild(descEl);
            card.appendChild(metaDiv);
            card.appendChild(actionsDiv);

            fragment.appendChild(card);
        });

        organizerEventsEl.appendChild(fragment);
    }

    // =======================================================================
    // LOAD EVENTS
    // =======================================================================

    async function loadEvents() {
        if (!organizerEventsEl) return;

        organizerEventsEl.innerHTML = "";
        const loadingBox = document.createElement("div");
        loadingBox.className = "empty-events";
        const loadingP = document.createElement("p");
        loadingP.textContent = "Loading event catalog...";
        loadingBox.appendChild(loadingP);
        organizerEventsEl.appendChild(loadingBox);

        try {
            const res = await window.api.getEvents({ status: "ALL" });
            allEvents = (res && Array.isArray(res.data)) ? res.data : [];
            updateStatistics();
            renderEvents();
        } catch (err) {
            organizerEventsEl.innerHTML = "";
            const errBox = document.createElement("div");
            errBox.className = "empty-events";

            const errTitle = document.createElement("h3");
            errTitle.style.marginBottom = "8px";
            errTitle.style.color = "#f87171";
            errTitle.textContent = "Unable to load events";

            const errP = document.createElement("p");
            errP.textContent = err.message || "Failed to connect to the backend server.";

            const retryBtn = document.createElement("button");
            retryBtn.type = "button";
            retryBtn.className = "primary-button";
            retryBtn.style.marginTop = "14px";
            retryBtn.textContent = "Retry";
            retryBtn.addEventListener("click", loadEvents);

            errBox.appendChild(errTitle);
            errBox.appendChild(errP);
            errBox.appendChild(retryBtn);
            organizerEventsEl.appendChild(errBox);
        }
    }

    // =======================================================================
    // CATEGORY SYNCHRONIZATION WITH ORACLE (GET /api/categories)
    // =======================================================================

    async function loadCategories() {
        const categorySelectEl = document.getElementById("event-category");
        if (!categorySelectEl) return;

        categorySelectEl.disabled = true;
        categorySelectEl.innerHTML = '<option value="" disabled selected>Loading categories...</option>';

        try {
            const res = await window.api.getCategories();
            availableCategories = (res && Array.isArray(res.data)) ? res.data : [];

            if (availableCategories.length === 0) {
                categorySelectEl.innerHTML = '<option value="" disabled selected>No categories available</option>';
                categorySelectEl.disabled = true;
                return;
            }

            categorySelectEl.innerHTML = '<option value="" disabled selected>Select a category</option>';
            availableCategories.forEach(cat => {
                const opt = document.createElement("option");
                const catName = typeof cat === "string" ? cat : (cat.name || "");
                opt.value = catName;
                opt.textContent = catName;
                categorySelectEl.appendChild(opt);
            });

            categorySelectEl.disabled = false;
        } catch (err) {
            console.error("[Organizer] Failed to load categories:", err);
            categorySelectEl.innerHTML = '<option value="" disabled selected>Error loading categories</option>';
            categorySelectEl.disabled = true;
            if (formMessageEl) {
                setMessage(formMessageEl, "Unable to load event categories from server. Please refresh or try again.", true);
            }
        }
    }

    // =======================================================================
    // EDIT EVENT MODAL
    // =======================================================================

    async function openEditModal(eventId) {
        if (!editModalBackdrop) return;

        setMessage(editFormMessageEl, "", false);
        editEventForm.reset();

        // Populate category dropdown with available categories
        editCategorySelect.innerHTML = '<option value="" disabled selected>Select a category...</option>';
        availableCategories.forEach(cat => {
            const opt = document.createElement("option");
            opt.value = String(cat.id);
            opt.textContent = cat.name;
            editCategorySelect.appendChild(opt);
        });

        try {
            const res = await window.api.getEventById(eventId);
            if (!res || !res.data) {
                alert("Unable to fetch event details.");
                return;
            }
            const evt = res.data;

            editEventIdInput.value = evt.id;
            editTitleInput.value = evt.title || "";
            editCityInput.value = evt.city || "";
            editVenueInput.value = evt.venue || "";
            editDateInput.value = evt.date ? evt.date.split("T")[0] : "";
            editTimeInput.value = evt.time || "";
            editPriceInput.value = (evt.price !== undefined && evt.price !== null) ? evt.price : 0;
            editCapacityInput.value = evt.capacity || 100;
            editImageInput.value = (evt.image && evt.image !== "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80") ? evt.image : "";
            editDescriptionInput.value = evt.description || "";

            // Match category
            if (evt.categoryId) {
                editCategorySelect.value = String(evt.categoryId);
            } else if (evt.category) {
                const matched = availableCategories.find(c => c.name.toLowerCase() === evt.category.toLowerCase());
                if (matched) editCategorySelect.value = String(matched.id);
            }

            // Authoritative booked tickets check & locked fields
            const bookedCount = Number(evt.bookedCount || 0);
            if (bookedCount > 0) {
                editLockedNotice.removeAttribute("hidden");
                editLockedNoticeText.textContent = `This event has ${bookedCount} confirmed booked ticket${bookedCount === 1 ? "" : "s"}. To protect existing attendee bookings, the event title and ticket price cannot be changed.`;
                editTitleInput.disabled = true;
                editTitleInput.classList.add("input-locked");
                editPriceInput.disabled = true;
                editPriceInput.classList.add("input-locked");
                editCapacityInput.min = String(bookedCount);
            } else {
                editLockedNotice.setAttribute("hidden", "");
                editTitleInput.disabled = false;
                editTitleInput.classList.remove("input-locked");
                editPriceInput.disabled = false;
                editPriceInput.classList.remove("input-locked");
                editCapacityInput.min = "1";
            }

            editModalBackdrop.removeAttribute("hidden");
            // Set focus to the first editable input
            if (!editTitleInput.disabled) {
                editTitleInput.focus();
            } else {
                editDateInput.focus();
            }
        } catch (err) {
            alert("Error loading event for editing: " + (err.message || "Network error"));
        }
    }

    function closeEditModal() {
        if (!editModalBackdrop) return;
        editModalBackdrop.setAttribute("hidden", "");
        setMessage(editFormMessageEl, "", false);
        isSubmittingEdit = false;
        if (saveEditBtn) {
            saveEditBtn.disabled = false;
            saveEditBtn.textContent = "Save Changes";
        }
    }

    // =======================================================================
    // CANCEL EVENT MODAL
    // =======================================================================

    function openCancelModal(event) {
        if (!cancelModalBackdrop || !event) return;
        cancelEventIdInput.value = event.id;
        cancelReasonInput.value = "";
        setMessage(cancelFormMessageEl, "", false);
        cancelModalBackdrop.removeAttribute("hidden");
        cancelReasonInput.focus();
    }

    function closeCancelModal() {
        if (!cancelModalBackdrop) return;
        cancelModalBackdrop.setAttribute("hidden", "");
        setMessage(cancelFormMessageEl, "", false);
        isSubmittingCancel = false;
        if (confirmCancelBtn) {
            confirmCancelBtn.disabled = false;
            confirmCancelBtn.textContent = "Yes, Cancel Event";
        }
        if (abortCancelBtn) {
            abortCancelBtn.disabled = false;
        }
    }

    // =======================================================================
    // EVENT CREATION & EDITING FORM HANDLERS
    // =======================================================================

    function initFormHandlers() {
        if (openFormBtn && eventFormSection) {
            openFormBtn.addEventListener("click", () => {
                eventFormSection.hidden = false;
                eventFormSection.scrollIntoView({ behavior: "smooth", block: "start" });
                const titleInput = document.getElementById("event-title");
                if (titleInput) {
                    titleInput.focus();
                }
            });
        }

        if (closeFormBtn && eventFormSection) {
            closeFormBtn.addEventListener("click", () => {
                eventFormSection.hidden = true;
                if (formMessageEl) formMessageEl.textContent = "";
            });
        }

        const dateInput = document.getElementById("event-date");
        if (dateInput) {
            dateInput.min = new Date().toISOString().split("T")[0];
        }

        if (createEventForm) {
            createEventForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (isSubmitting) return;

                const title = document.getElementById("event-title").value.trim();
                const category = document.getElementById("event-category").value;
                const city = document.getElementById("event-city").value.trim();
                const venue = document.getElementById("event-venue").value.trim();
                const date = document.getElementById("event-date").value;
                const timeInput = document.getElementById("event-time");
                const time = timeInput ? timeInput.value.trim() : "";
                const price = Number(document.getElementById("event-price").value);
                const capacity = Number(document.getElementById("event-capacity").value);
                const description = document.getElementById("event-description").value.trim();
                const submitBtn = createEventForm.querySelector("button[type='submit']");

                // Client-side validations
                if (!title || !category || !date) {
                    setMessage(formMessageEl, "Event name, category, and date are required.", true);
                    return;
                }

                // Strict category validation against loaded Oracle categories
                const isValidCategory = availableCategories.some(c => {
                    const cName = typeof c === "string" ? c : (c.name || "");
                    return cName.toLowerCase() === category.trim().toLowerCase();
                });

                if (!isValidCategory) {
                    setMessage(formMessageEl, "Please select a valid event category from the list.", true);
                    return;
                }

                const todayStr = new Date().toISOString().split("T")[0];
                if (date < todayStr) {
                    setMessage(formMessageEl, "Event date must be today or in the future.", true);
                    return;
                }

                if (isNaN(price) || price < 0) {
                    setMessage(formMessageEl, "Ticket price must be 0 or a positive number.", true);
                    return;
                }

                if (isNaN(capacity) || capacity < 1) {
                    setMessage(formMessageEl, "Ticket capacity must be at least 1.", true);
                    return;
                }

                isSubmitting = true;
                const originalBtnText = submitBtn ? submitBtn.textContent : "+ Create Event";
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = "Creating event on server...";
                }
                setMessage(formMessageEl, "", false);

                try {
                    const response = await window.api.createEvent({
                        title,
                        category,
                        date,
                        time: time || undefined,
                        city: city || "Surat",
                        venue: venue || "Main Auditorium",
                        price,
                        capacity,
                        description
                    });

                    if (response && response.success && response.data) {
                        const newEvent = response.data;
                        setMessage(formMessageEl, `✓ Event "${newEvent.title}" created successfully!`, false);

                        createEventForm.reset();
                        const catSelect = document.getElementById("event-category");
                        if (catSelect) {
                            catSelect.value = "";
                        }
                        if (timeInput) {
                            timeInput.value = "";
                        }
                        document.getElementById("event-price").value = 199;
                        document.getElementById("event-capacity").value = 100;

                        // Refresh event catalog from server so new event appears
                        await loadEvents();
                    } else {
                        throw new Error((response && response.message) || "Event creation could not be confirmed.");
                    }
                } catch (err) {
                    let errMsg = err.message || "Failed to create event. Please check inputs.";
                    if (err.status === 401) {
                        errMsg = "Your session has expired. Please log in again.";
                    } else if (err.status === 403) {
                        errMsg = "Access denied: Only organizers and administrators can create events.";
                    }
                    setMessage(formMessageEl, errMsg, true);
                } finally {
                    isSubmitting = false;
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalBtnText;
                    }
                }
            });
        }

        if (statusFilter) {
            statusFilter.addEventListener("change", renderEvents);
        }

        // Edit Modal Controls & Listeners
        if (closeEditModalBtn) {
            closeEditModalBtn.addEventListener("click", closeEditModal);
        }
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener("click", closeEditModal);
        }
        if (editModalBackdrop) {
            editModalBackdrop.addEventListener("click", (e) => {
                if (e.target === editModalBackdrop) {
                    closeEditModal();
                }
            });
        }
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                if (editModalBackdrop && !editModalBackdrop.hasAttribute("hidden")) {
                    closeEditModal();
                }
                if (cancelModalBackdrop && !cancelModalBackdrop.hasAttribute("hidden")) {
                    closeCancelModal();
                }
            }
        });

        if (editEventForm) {
            editEventForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                if (isSubmittingEdit) return;

                const eventId = editEventIdInput.value;
                if (!eventId) return;

                const titleVal = editTitleInput.value.trim();
                if (!editTitleInput.disabled && titleVal.length < 2) {
                    setMessage(editFormMessageEl, "Event title must be at least 2 characters.", true);
                    return;
                }

                const catVal = editCategorySelect.value;
                if (!catVal) {
                    setMessage(editFormMessageEl, "Please select an event category.", true);
                    return;
                }

                const dateVal = editDateInput.value;
                if (!dateVal) {
                    setMessage(editFormMessageEl, "Please provide a valid event date.", true);
                    return;
                }

                const priceNum = Number(editPriceInput.value);
                if (!editPriceInput.disabled && (isNaN(priceNum) || priceNum < 0)) {
                    setMessage(editFormMessageEl, "Ticket price must be 0 or greater.", true);
                    return;
                }

                const capacityNum = Number(editCapacityInput.value);
                const minCap = Number(editCapacityInput.min || 1);
                if (isNaN(capacityNum) || capacityNum < minCap) {
                    setMessage(editFormMessageEl, `Capacity must be at least ${minCap}.`, true);
                    return;
                }

                isSubmittingEdit = true;
                if (saveEditBtn) {
                    saveEditBtn.disabled = true;
                    saveEditBtn.textContent = "Saving...";
                }
                setMessage(editFormMessageEl, "Saving changes to Oracle Database...", false);

                const payload = {
                    title: titleVal,
                    categoryId: Number(catVal),
                    city: editCityInput.value.trim() || "Surat",
                    venue: editVenueInput.value.trim() || "Main Auditorium",
                    date: dateVal,
                    time: editTimeInput.value.trim() || null,
                    price: priceNum,
                    capacity: capacityNum,
                    description: editDescriptionInput.value.trim(),
                    imageUrl: editImageInput.value.trim() || undefined
                };

                try {
                    const response = await window.api.updateEvent(eventId, payload);
                    if (response && response.success) {
                        setMessage(editFormMessageEl, "✓ Event updated successfully!", false);
                        setTimeout(async () => {
                            closeEditModal();
                            await loadEvents();
                        }, 400);
                    } else {
                        throw new Error((response && response.message) || "Update failed.");
                    }
                } catch (err) {
                    let errMsg = err.message || "Failed to save event changes.";
                    if (err.status === 401) {
                        errMsg = "Your session has expired. Please log in again.";
                    } else if (err.status === 403) {
                        errMsg = "Access denied: You are not authorized to edit this event.";
                    }
                    setMessage(editFormMessageEl, errMsg, true);
                    if (saveEditBtn) {
                        saveEditBtn.disabled = false;
                        saveEditBtn.textContent = "Save Changes";
                    }
                    isSubmittingEdit = false;
                }
            });
        }

        // Cancel Modal Controls & Listeners
        if (closeCancelModalBtn) {
            closeCancelModalBtn.addEventListener("click", closeCancelModal);
        }
        if (abortCancelBtn) {
            abortCancelBtn.addEventListener("click", closeCancelModal);
        }
        if (cancelModalBackdrop) {
            cancelModalBackdrop.addEventListener("click", (e) => {
                if (e.target === cancelModalBackdrop) {
                    closeCancelModal();
                }
            });
        }

        if (cancelEventForm) {
            cancelEventForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                if (isSubmittingCancel) return;

                const eventId = cancelEventIdInput.value;
                if (!eventId) return;

                const reason = cancelReasonInput.value.trim();
                if (reason.length > 500) {
                    setMessage(cancelFormMessageEl, "Cancellation reason cannot exceed 500 characters.", true);
                    return;
                }

                isSubmittingCancel = true;
                if (confirmCancelBtn) {
                    confirmCancelBtn.disabled = true;
                    confirmCancelBtn.textContent = "Cancelling event...";
                }
                if (abortCancelBtn) {
                    abortCancelBtn.disabled = true;
                }
                setMessage(cancelFormMessageEl, "Processing event cancellation and attendee notifications...", false);

                try {
                    const response = await window.api.cancelEvent(eventId, { reason });
                    if (response && response.success) {
                        setMessage(cancelFormMessageEl, "✓ Event cancelled successfully.", false);
                        setTimeout(async () => {
                            closeCancelModal();
                            await loadEvents();
                        }, 400);
                    } else {
                        throw new Error((response && response.message) || "Failed to cancel event.");
                    }
                } catch (err) {
                    let errMsg = err.message || "Failed to cancel event.";
                    if (err.status === 401) {
                        errMsg = "Your session has expired. Please log in again.";
                    } else if (err.status === 403) {
                        errMsg = "Access denied: You are not authorized to cancel this event.";
                    } else if (err.status === 404) {
                        errMsg = "Event not found or already removed.";
                    }
                    setMessage(cancelFormMessageEl, errMsg, true);
                    if (confirmCancelBtn) {
                        confirmCancelBtn.disabled = false;
                        confirmCancelBtn.textContent = "Yes, Cancel Event";
                    }
                    if (abortCancelBtn) {
                        abortCancelBtn.disabled = false;
                    }
                    isSubmittingCancel = false;
                }
            });
        }
    }

    // =======================================================================
    // INITIALIZATION
    // =======================================================================

    async function init() {
        const authorized = await checkAuthorization();
        if (authorized) {
            initFormHandlers();
            await Promise.all([
                loadCategories(),
                loadEvents()
            ]);
        }
    }

    if (typeof window !== "undefined") {
        window.loadOrganizerCategories = loadCategories;
        window.getAvailableCategories = () => availableCategories;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
