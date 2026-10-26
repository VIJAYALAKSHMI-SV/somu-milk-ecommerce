
const Customer = require("../models/Customer");
const jwt = require("jsonwebtoken");

// Generate a customer JWT token
const generateCustomerToken = (customer) => {
  return jwt.sign(
    {
      id: customer._id.toString(),
      role: "customer",
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
};

// Customer registration
const registerCustomer = async (req, res) => {
  try {
    const { name, email, phone, password, address } = req.body;

    if (
      !name?.trim() ||
      !email?.trim() ||
      typeof password !== "string" ||
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, valid email, and password of at least 8 characters are required.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingCustomer = await Customer.findOne({
      email: normalizedEmail,
    });

    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const customer = await Customer.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: typeof phone === "string" ? phone.trim() : "",
      password,
      address: typeof address === "string" ? address.trim() : "",
    });

    const token = generateCustomerToken(customer);

    return res.status(201).json({
      success: true,
      message: "Customer registered successfully",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error("Customer registration error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to register customer",
    });
  }
};

// Customer login
const loginCustomer = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const customer = await Customer.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password");

    if (!customer || !(await customer.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = generateCustomerToken(customer);

    return res.status(200).json({
      success: true,
      message: "Customer login successful",
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
      },
    });
  } catch (error) {
    console.error("Customer login error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to log in",
    });
  }
};

module.exports = {
  registerCustomer,
  loginCustomer,
};
