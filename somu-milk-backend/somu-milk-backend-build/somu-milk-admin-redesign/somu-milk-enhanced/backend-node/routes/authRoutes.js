
const express = require("express");
const router = express.Router();

const { adminLogin } = require("../controllers/authController");
const {
  registerCustomer,
  loginCustomer,
} = require("../controllers/customerController");

// Admin login
router.post("/admin/login", adminLogin);

// Customer authentication
router.post("/customer/register", registerCustomer);
router.post("/customer/login", loginCustomer);

module.exports = router;

