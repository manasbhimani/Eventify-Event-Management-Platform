
const sampleBookings = [
    {
        id: "EVT-1001",
        eventId: 1,
        title: "Technology Summit",
        date: "2027-01-15T10:00:00",
        venue: "Innovation Hall, Surat",
        quantity: 2,
        amount: 398,
        status: "CONFIRMED",
        icon: "💻"
    },
    {
        id: "EVT-1002",
        eventId: 3,
        title: "Creative Design Workshop",
        date: "2027-02-10T11:00:00",
        venue: "Creative Studio, Ahmedabad",
        quantity: 1,
        amount: 299,
        status: "CONFIRMED",
        icon: "🎨"
    },
    {
        id: "EVT-1003",
        eventId: 5,
        title: "Community Sports Day",
        date: "2026-03-10T09:00:00",
        venue: "City Sports Ground, Vadodara",
        quantity: 1,
        amount: 149,
        status: "COMPLETED",
        icon: "⚽"
    }
];

const bookingsList = document.getElementById("bookings-list");
const bookingFilter = document.getElementById("booking-filter");

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function isUpcoming(booking) {
    return new Date(booking.date) >= new Date() &&
        booking.status === "CONFIRMED";
}

function updateStatistics() {
    document.getElementById("total-bookings").textContent =
        sampleBookings.length;

    document.getElementById("upcoming-bookings").textContent =
        sampleBookings.filter(isUpcoming).length;

    const total = sampleBookings
        .filter(booking => booking.status !== "CANCELLED")
        .reduce((sum, booking) => sum + booking.amount, 0);

    document.getElementById("total-amount").textContent =
        "₹" + total.toLocaleString("en-IN");
}

function renderBookings() {
    const selectedStatus = bookingFilter.value;

    const filteredBookings = sampleBookings.filter(booking =>
        selectedStatus === "ALL" || booking.status === selectedStatus
    );

    if (filteredBookings.length === 0) {
        bookingsList.innerHTML = `
            <div class="empty-bookings">
                <h3>No bookings found</h3>
                <p>Try another filter or discover your next event.</p>
                <a href="index.html" class="explore-button">
                    Explore Events
                </a>
            </div>
        `;
        return;
    }

    bookingsList.innerHTML = filteredBookings.map(booking => {
        const statusClass = booking.status.toLowerCase();

        const cancelButton =
            booking.status === "CONFIRMED" && isUpcoming(booking)
                ? `<button class="booking-action cancel-button"
                    data-booking-id="${booking.id}">
                    Cancel Booking
                   </button>`
                : "";

        return `
            <article class="booking-card">
                <div class="booking-art">${booking.icon}</div>

                <div class="booking-details">
                    <div class="booking-topline">
                        <div>
                            <h3>${booking.title}</h3>
                            <p class="booking-date">
                                📅 ${formatDate(booking.date)}
                            </p>
                        </div>

                        <span class="booking-status status-${statusClass}">
                            ${booking.status}
                        </span>
                    </div>

                    <p class="booking-venue">📍 ${booking.venue}</p>
                    <p class="booking-reference">
                        Booking ID: ${booking.id}
                        · ${booking.quantity} ticket(s)
                    </p>

                    <div class="booking-bottom">
                        <span class="booking-price">
                            ₹${booking.amount.toLocaleString("en-IN")}
                        </span>

                        <div class="booking-actions">
                            <a class="booking-action"
                               href="event.html?id=${booking.eventId}">
                                View Event
                            </a>

                            ${cancelButton}
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

bookingFilter.addEventListener("change", renderBookings);

bookingsList.addEventListener("click", function (event) {
    const button = event.target.closest("[data-booking-id]");

    if (!button) {
        return;
    }

    const bookingId = button.dataset.bookingId;

    const booking = sampleBookings.find(
        item => item.id === bookingId
    );

    if (!booking) {
        return;
    }

    const confirmed = window.confirm(
        "Cancel demo booking " + booking.id + "?"
    );

    if (!confirmed) {
        return;
    }

    booking.status = "CANCELLED";

    updateStatistics();
    renderBookings();
});

updateStatistics();
renderBookings();
