require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.get("/", (req, res) => {
  res.send("Wanderlust Backend is running 🚀");
});

/* =========================
   CORS FIX (IMPORTANT)
========================= */
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:8081",
    "http://localhost:8080",
    "https://lovely-tartufo-088717.netlify.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));


// preflight support (VERY IMPORTANT)
app.options("*", cors());

app.use(express.json());

/* =========================
   EMAIL SETUP
========================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* =========================
   CREATE CASHFREE ORDER
========================= */
app.post("/create-order", async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);

    const { formData } = req.body;

    if (!formData) {
      return res.status(400).json({ error: "Missing formData" });
    }

    const { name, email, phone, date, packageId, price } = formData;

    // ✅ VALID PACKAGE IDS
    const validPackages = ["1","2","3","4","5","6","7","8"];

    if (!packageId) {
  return res.status(400).json({ error: "Package not selected" });
}

    const amount = Number(price);

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const orderId = "order_" + Date.now();

    const response = await axios.post(
      "https://api.cashfree.com/pg/orders",
      {
        order_id: orderId,
        order_amount: amount,
        order_currency: "INR",
        customer_details: {
          customer_id: "cust_" + Date.now(),
          customer_email: email,
          customer_phone: phone,
        },
        order_meta: {
          return_url:
            "https://lovely-tartufo-088717.netlify.app/success?order_id={order_id}",
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET_KEY,
          "x-api-version": "2022-09-01",
        },
      }
    );

    return res.json({
      payment_session_id: response.data.payment_session_id,
      order_id: orderId,
    });

  } catch (error) {
    console.log("CREATE ORDER ERROR:", error.response?.data || error.message);
    return res.status(500).json({ error: "Order creation failed" });
  }
});

/* =========================
   VERIFY PAYMENT
========================= */
app.post("/verify-payment", async (req, res) => {
  const { order_id, formData } = req.body;

  try {
    const response = await axios.get(
      `https://api.cashfree.com/pg/orders/${order_id}/payments`,
      {
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET_KEY,
          "x-api-version": "2022-09-01",
        },
      }
    );

    const payments = response.data;

    const successPayment = payments.find(
      (p) => p.payment_status === "SUCCESS"
    );

    if (!successPayment) {
      return res.json({ status: "failed" });
    }

    const paymentId = successPayment.cf_payment_id;

    // ❌ packageMap हटाया
    // ✅ frontend से ही package info use कर रहे हैं

    // ✅ USER EMAIL
    await transporter.sendMail({
      from: `"Wanderlust Team" <${process.env.EMAIL_USER}>`,
      to: formData.email,
      subject: "🎉 Booking Confirmed!",
      html: `
        <h2>Hi ${formData.name} 👋</h2>
        <p>Your booking is successfully confirmed 🎉</p>

        <p><b>Order ID:</b> ${order_id}</p>
        <p><b>Payment ID:</b> ${paymentId}</p>
        <p><b>Package ID:</b> ${formData.packageId}</p>
        <p><b>Date:</b> ${formData.date}</p>
      `,
    });

    // ✅ ADMIN EMAIL
    await transporter.sendMail({
      from: `"Admin" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "🚀 New Booking Received",
      html: `
        <h3>New Booking</h3>
        <p><b>Name:</b> ${formData.name}</p>
        <p><b>Email:</b> ${formData.email}</p>
        <p><b>Phone:</b> ${formData.phone}</p>
        <p><b>Package ID:</b> ${formData.packageId}</p>
        <p><b>Date:</b> ${formData.date}</p>
      `,
    });

    return res.json({ status: "success" });

  } catch (err) {
    console.log("VERIFY ERROR:", err.response?.data || err.message);
    return res.status(500).json({ error: "verification failed" });
  }
});
/* =========================
   CONTACT
========================= */
app.post("/contact", async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  try {
    await transporter.sendMail({
      from: `"${name}" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `New Contact Inquiry: ${subject}`,
      html: `
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p>${message}</p>
      `,
    });

    res.json({ status: "success" });

  } catch (error) {
    console.log("CONTACT ERROR:", error.message);
    res.status(500).json({ status: "failed" });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 5000;
console.log("NEW BACKEND RUNNING ✅");
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});