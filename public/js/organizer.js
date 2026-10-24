
const eventFormSection = document.getElementById("event-form-section");
const createEventForm = document.getElementById("create-event-form");
const organizerEvents = document.getElementById("organizer-events");
const statusFilter = document.getElementById("status-filter");
const formMessage = document.getElementById("event-form-message");

const demoEvents = [
    {
        id: 101,
        title: "Future of Technology Summit",
        category: "Technology",
        city: "Surat",
        venue: "Innovation Hall",
        date: "2027-01-15",
        time: "10:00",
        price: 199,
        capacity: 200,
        registrations: 84,
        description: "Explore emerging technologies and connect with innovators.",
        status: "PUBLISHED"
    },
    {
        id: 102,
        title: "Creative Design Workshop",
        category: "Workshop",
        city: "Ahmedabad",
        venue: "Creative Studio",
        date: "2027-02-10",
        time: "11:00",
        price: 299,
        capacity: 100,
        registrations: 35,
        description: "Learn practical design skills through hands-on activities.",
        status: "PUBLISHED"
    },
    {
        id: 103,
        title: "Startup Networking Meetup",
        category: "Business",
        city: "Vadodara",
        venue: "Business Centre",
        date: "2027-03-20",
        time: "14:00",
        price: 0,
        capacity: 80,
        registrations: 0,
        description: "Meet founders and exchange startup ideas.",
        status: "DRAFT"
    }
];

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

function formatEventDate(dateString) {
    const parts = dateString.split("-");
    const date = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
    );

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function formatRupees(amount) {
    return "₹" + Number(amount).toLocaleString("en-IN");
}

function updateStatistics() {
    document.getElementById("stat-events").textContent =
        demoEvents.length;

    const availableTickets = demoEvents
        .filter(event => event.status !== "CANCELLED")
        .reduce((total, event) => {
            return total + event.capacity - event.registrations;
        }, 0);

    const registrations = demoEvents.reduce((total, event) => {
        return total + event.registrations;
    }, 0);

    const potentialValue = demoEvents
        .filter(event => event.status === "PUBLISHED")
        .reduce((total, event) => {
            return total + event.price * event.capacity;
        }, 0);

    document.getElementById("stat-tickets").textContent =
        availableTickets.toLocaleString("en-IN");

    document.getElementById("stat-registrations").textContent =
        registrations.toLocaleString("en-IN");

    document.getElementById("stat-value").textContent =
        formatRupees(potentialValue);
}

function renderEvents() {
    const selectedStatus = statusFilter.value;

    const filteredEvents = demoEvents.filter(event => {
        return selectedStatus === "ALL" ||
            event.status === selectedStatus;
    });

    if (filteredEvents.length === 0) {
        organizerEvents.innerHTML = `
            <div class="empty-events">
                <p>No events match this filter.</p>
            </div>
        `;
        return;
    }

    organizerEvents.innerHTML = filteredEvents.map(event => {
        const soldPercentage = event.capacity > 0
            ? Math.min(100, Math.round(
                event.registrations / event.capacity * 100
            ))
            : 0;

        const statusClass = event.status.toLowerCase();

        let actionButtons = "";

        if (event.status === "DRAFT") {
            actionButtons += `
                <button class="event-action"
                    data-action="publish" data-id="${event.id}">
                    Publish
                </button>
            `;
        }

        if (event.status === "PUBLISHED") {
            actionButtons += `
                <button class="event-action"
                    data-action="draft" data-id="${event.id}">
                    Move to Draft
                </button>

                <button class="event-action danger"
                    data-action="cancel" data-id="${event.id}">
                    Cancel Event
                </button>
            `;
        }

        return `
            <article class="managed-event">
                <div class="managed-event-top">
                    <div>
                        <h3>${escapeHTML(event.title)}</h3>
                        <p class="event-category">
                            ${escapeHTML(event.category)}
                        </p>
                    </div>

                    <span class="event-status ${statusClass}">
                        ${event.status}
                    </span>
                </div>

                <p class="event-description">
                    ${escapeHTML(event.description || "No description provided.")}
                </p>

                <div class="event-meta">
                    <span>📅 ${formatEventDate(event.date)} · ${escapeHTML(event.time)}</span>
                    <span>📍 ${escapeHTML(event.venue)}, ${escapeHTML(event.city)}</span>
                    <span>🎟️ ${formatRupees(event.price)} per ticket</span>
                </div>

                <div class="event-progress">
                    <div class="event-progress-bar"
                        style="width: ${soldPercentage}%"></div>
                </div>

                <p class="ticket-summary">
                    ${event.registrations} registrations out of
                    ${event.capacity} tickets (${soldPercentage}%)
                </p>

                <div class="event-actions">
                    ${actionButtons}
                </div>
            </article>
        `;
    }).join("");
}

document.getElementById("open-event-form").addEventListener("click", function () {
    eventFormSection.hidden = false;
    eventFormSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});

document.getElementById("close-event-form").addEventListener("click", function () {
    eventFormSection.hidden = true;
    formMessage.textContent = "";
});

document.getElementById("event-date").min = new Date().toLocaleDateString(
    "en-CA"
);

createEventForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const title = document.getElementById("event-title").value.trim();
    const city = document.getElementById("event-city").value.trim();
    const venue = document.getElementById("event-venue").value.trim();
    const date = document.getElementById("event-date").value;
    const time = document.getElementById("event-time").value;
    const price = Number(document.getElementById("event-price").value);
    const capacity = Number(document.getElementById("event-capacity").value);
    const description = document.getElementById("event-description").value.trim();
    const category = document.getElementById("event-category").value;

    if (!title || !city || !venue || !date || !time) {
        formMessage.textContent = "Please complete all required fields.";
        return;
    }

    if (date < new Date().toLocaleDateString("en-CA")) {
        formMessage.textContent = "Choose today or a future date.";
        return;
    }

    if (!Number.isInteger(price) || price < 0 ||
        !Number.isInteger(capacity) || capacity < 1) {
        formMessage.textContent =
            "Enter a valid ticket price and quantity.";
        return;
    }

    demoEvents.unshift({
        id: Date.now(),
        title,
        category,
        city,
        venue,
        date,
        time,
        price,
        capacity,
        registrations: 0,
        description,
        status: "DRAFT"
    });

    createEventForm.reset();
    document.getElementById("event-price").value = 199;
    document.getElementById("event-capacity").value = 100;
    formMessage.textContent = "Demo event created as a draft.";

    statusFilter.value = "ALL";

    updateStatistics();
    renderEvents();
});

statusFilter.addEventListener("change", renderEvents);

organizerEvents.addEventListener("click", function (event) {
    const button = event.target.closest("[data-action]");

    if (!button) {
        return;
    }

    const eventId = Number(button.dataset.id);
    const action = button.dataset.action;

    const selectedEvent = demoEvents.find(item => item.id === eventId);

    if (!selectedEvent) {
        return;
    }

    if (action === "publish") {
        selectedEvent.status = "PUBLISHED";
    } else if (action === "draft") {
        selectedEvent.status = "DRAFT";
    } else if (action === "cancel") {
        const confirmed = window.confirm(
            "Cancel the event '" + selectedEvent.title + "'?"
        );

        if (!confirmed) {
            return;
        }

        selectedEvent.status = "CANCELLED";
    }

    updateStatistics();
    renderEvents();
});

updateStatistics();
renderEvents();
