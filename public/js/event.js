
const sampleEvents = [
    {
        id: 1,
        title: "Future of Technology Summit",
        category: "Technology",
        date: "2027-01-15",
        city: "Surat",
        venue: "Innovation Hall",
        price: 199,
        capacity: 100,
        description:
            "Explore emerging technologies, meet fellow technology enthusiasts, and discover new ideas through talks and discussions. This sample event is designed for students, developers, and innovators.",
        image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1400&q=85"
    },
    {
        id: 2,
        title: "Live Music Night",
        category: "Music",
        date: "2027-01-22",
        city: "Ahmedabad",
        venue: "City Auditorium",
        price: 499,
        capacity: 200,
        description:
            "Enjoy an evening of live performances, music, and community. Discover local talent and share a memorable night with fellow music lovers.",
        image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=85"
    },
    {
        id: 3,
        title: "Creative Design Workshop",
        category: "Workshop",
        date: "2027-02-05",
        city: "Surat",
        venue: "Creative Studio",
        price: 299,
        capacity: 50,
        description:
            "Learn creative problem-solving, explore design fundamentals, and practise turning ideas into useful digital experiences.",
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=85"
    },
    {
        id: 4,
        title: "Startup Networking Meetup",
        category: "Business",
        date: "2027-02-12",
        city: "Vadodara",
        venue: "Business Hub",
        price: 0,
        capacity: 80,
        description:
            "Connect with students, entrepreneurs, and professionals. Share ideas, learn from other founders, and explore collaboration opportunities.",
        image: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=85"
    },
    {
        id: 5,
        title: "Community Sports Day",
        category: "Sports",
        date: "2027-02-20",
        city: "Surat",
        venue: "Sports Complex",
        price: 149,
        capacity: 100,
        description:
            "Take part in a fun community sports event featuring friendly competition, teamwork, and activities for sports enthusiasts.",
        image: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1400&q=85"
    },
    {
        id: 6,
        title: "Web Development Bootcamp",
        category: "Technology",
        date: "2027-03-06",
        city: "Ahmedabad",
        venue: "Learning Centre",
        price: 399,
        capacity: 60,
        description:
            "Explore the fundamentals of web development and learn how HTML, CSS, and JavaScript work together to create websites.",
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=85"
    }
];

const eventId = Number(
    new URLSearchParams(window.location.search).get("id")
);

const selectedEvent = sampleEvents.find(
    event => event.id === eventId
);

const eventContent = document.getElementById("event-content");

function formatEventDate(dateString) {
    return new Date(dateString + "T12:00:00").toLocaleDateString(
        "en-IN",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );
}

function showNotFound() {
    eventContent.innerHTML = `
        <div class="error-state">
            <h2>Event not found</h2>
            <p>This event does not exist in our sample event list.</p>
            <a class="btn btn-primary" href="index.html#events">
                Browse events
            </a>
        </div>
    `;
}

function renderEvent(event) {
    document.title = `${event.title} | Eventify`;

    eventContent.innerHTML = `
        <section class="event-banner"
            style="background-image: url('${event.image}')">
            <div class="event-banner-content">
                <span class="eyebrow">${event.category.toUpperCase()}</span>
                <h1>${event.title}</h1>
                <p>${formatEventDate(event.date)} · ${event.city}</p>
            </div>
        </section>

        <div class="event-layout">
            <section class="event-main">
                <div class="event-facts">
                    <div class="event-fact">
                        <span>Date</span>
                        <strong>${formatEventDate(event.date)}</strong>
                    </div>
                    <div class="event-fact">
                        <span>Location</span>
                        <strong>${event.venue}, ${event.city}</strong>
                    </div>
                    <div class="event-fact">
                        <span>Category</span>
                        <strong>${event.category}</strong>
                    </div>
                    <div class="event-fact">
                        <span>Listed capacity</span>
                        <strong>${event.capacity} tickets</strong>
                    </div>
                </div>

                <h2>About this event</h2>
                <p>${event.description}</p>
            </section>

            <aside class="booking-card">
                <p class="eyebrow">YOUR NEXT EXPERIENCE</p>
                <p class="price">
                    ${event.price === 0 ? "Free" : "₹" + event.price}
                </p>
                <p class="muted">Price per ticket</p>

                <form id="booking-form">
                    <label for="ticket-quantity">Number of tickets</label>
                    <select id="ticket-quantity" name="quantity">
                        ${Array.from(
                            { length: Math.min(5, event.capacity) },
                            (_, index) => `
                                <option value="${index + 1}">
                                    ${index + 1} ticket${index === 0 ? "" : "s"}
                                </option>
                            `
                        ).join("")}
                    </select>

                    <div class="booking-total">
                        <span>Total</span>
                        <strong id="booking-total">
                            ${event.price === 0 ? "Free" : "₹" + event.price}
                        </strong>
                    </div>

                    <button class="btn btn-primary" type="submit">
                        Continue to booking
                    </button>

                    <p class="booking-note">
                        Demo only — tickets are not reserved yet.
                    </p>
                    <p class="booking-message" id="booking-message"
                       role="status" aria-live="polite"></p>
                </form>
            </aside>
        </div>
    `;

    const quantityInput = document.getElementById("ticket-quantity");
    const totalDisplay = document.getElementById("booking-total");
    const bookingForm = document.getElementById("booking-form");
    const message = document.getElementById("booking-message");

    function updateTotal() {
        const quantity = Number(quantityInput.value);
        const total = event.price * quantity;

        totalDisplay.textContent =
            total === 0 ? "Free" : "₹" + total;
    }

    quantityInput.addEventListener("change", updateTotal);

    bookingForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const quantity = Number(quantityInput.value);
        const total = event.price * quantity;

        message.textContent =
            `Demo selection: ${quantity} ticket(s), total ₹${total}. ` +
            "No booking has been created. Backend integration is coming next.";
    });
}

if (selectedEvent) {
    renderEvent(selectedEvent);
} else {
    showNotFound();
}
