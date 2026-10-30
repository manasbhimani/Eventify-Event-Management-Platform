/**
 * src/db/repositories/index.js
 *
 * Eventify — Oracle Repositories Module.
 * Exports all database domain repositories.
 */

"use strict";

const categoryRepository = require("./category.repository");
const userRepository     = require("./user.repository");
const sessionRepository  = require("./session.repository");
const eventRepository    = require("./event.repository");
const bookingRepository  = require("./booking.repository");
const adminRepository    = require("./admin.repository");

module.exports = {
    categoryRepository,
    userRepository,
    sessionRepository,
    eventRepository,
    bookingRepository,
    adminRepository
};
