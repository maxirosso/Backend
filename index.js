require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { body, validationResult } = require('express-validator');

const port = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage engine for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'uploads', // Folder where images will be stored in Cloudinary
    format: async (req, file) => 'png', // Supported formats: 'png', 'jpeg', etc.
    public_id: (req, file) => `${file.fieldname}_${Date.now()}` // Public ID for the image
  }
});

const upload = multer({ storage: storage });

// Database connection with MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('Database connection error:', err));

// API creation
app.get("/", (req, res) => {
  res.send("Express App is running");
});

// Create Upload endpoint for images
app.post("/upload", upload.single('product'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: 0, error: 'No file uploaded' });
  }
  res.json({
    success: 1,
    image_url: req.file.path
  });
});

// Schema for creating products
const Product = mongoose.model("Product", {
  id: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  new_price: {
    type: Number,
    required: true
  },
  old_price: {
    type: Number,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  available: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    required: true
  },
  sizes: {
    type: [String], // Add available sizes
    required: true
  }
});

app.post('/addproduct', [
  body('name').notEmpty().withMessage('Name is required'),
  body('image').notEmpty().withMessage('Image URL is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('new_price').isNumeric().withMessage('New price must be a number'),
  body('old_price').isNumeric().withMessage('Old price must be a number'),
  body('description').notEmpty().withMessage('Description is required'),
  body('sizes').isArray().withMessage('Sizes must be an array')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  let products = await Product.find({});
  let id;
  if (products.length > 0) {
    let last_product_array = products.slice(-1);
    let last_product = last_product_array[0];
    id = last_product.id + 1;
  } else {
    id = 1;
  }

  const product = new Product({
    id: id,
    name: req.body.name,
    image: req.body.image.split('/').pop(), // Ensure only the filename is stored
    category: req.body.category,
    new_price: req.body.new_price,
    old_price: req.body.old_price,
    description: req.body.description,
    sizes: req.body.sizes // Add sizes to the product
  });

  try {
    await product.save();
    console.log("Saved");
    res.json({
      success: 1,
      name: req.body.name
    });
  } catch (error) {
    console.error('Error saving product:', error);
    res.status(500).json({ success: 0, error: 'Failed to save product' });
  }
});

// Creating API for deleting products
app.post('/removeproduct', [
  body('id').isNumeric().withMessage('Product ID must be a number')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    await Product.findOneAndDelete({ id: req.body.id });
    console.log("Removed");
    res.json({
      success: true,
      name: req.body.name
    });
  } catch (error) {
    console.error('Error removing product:', error);
    res.status(500).json({ success: false, error: 'Failed to remove product' });
  }
});

// Creating API for getting all products
app.get('/allproducts', async (req, res) => {
  try {
    let products = await Product.find({});
    console.log("All Products Fetched");
    res.send(products);
  } catch (error) {
    console.error('Error fetching all products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Schema for User model
const Users = mongoose.model('Users', {
  name: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
  },
  password: {
    type: String,
  },
  cartData: {
    type: Map,
    of: Object,
  },
  date: {
    type: Date,
    default: Date.now
  }
});

// Creating Endpoint for registering the user
app.post('/signup', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Invalid email format'),
  body('password').isLength({ min: 5 }).withMessage('Password must be at least 5 characters long')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  let check = await Users.findOne({ email: req.body.email });
  if (check) {
    return res.status(400).json({ success: false, errors: "Existing user found with same Email address" });
  }

  let cart = {};
  for (let i = 0; i < 300; i++) {
    cart[i] = 0;
  }

  const hashedPassword = await bcrypt.hash(req.body.password, 10);

  const user = new Users({
    name: req.body.name,
    email: req.body.email,
    password: hashedPassword,
    cartData: cart
  });

  try {
    await user.save();

    const data = {
      user: {
        id: user.id
      }
    };

    const token = jwt.sign(data, process.env.JWT_SECRET);
    res.json({ success: true, token });
  } catch (error) {
    console.error('Error signing up user:', error);
    res.status(500).json({ success: false, error: 'Failed to sign up user' });
  }
});

// Creating endpoint for user login
app.post('/login', [
  body('email').isEmail().withMessage('Invalid email format'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    let user = await Users.findOne({ email: req.body.email });
    if (user) {
      const passCompare = await bcrypt.compare(req.body.password, user.password);
      if (passCompare) {
        const data = {
          user: {
            id: user.id
          }
        };
        const token = jwt.sign(data, process.env.JWT_SECRET);
        res.json({ success: true, token });
      } else {
        res.status(400).json({ success: false, errors: "Wrong Password" });
      }
    } else {
      res.status(400).json({ success: false, errors: "Wrong Email Id" });
    }
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ success: false, error: 'Failed to log in user' });
  }
});

// Creating Endpoint for new collection data
app.get('/newcollections', async (req, res) => {
  try {
    let products = await Product.find({});
    let newcollection = products.slice(1).slice(-8);
    console.log("NewCollection Fetched");
    res.send(newcollection);
  } catch (error) {
    console.error('Error fetching new collections:', error);
    res.status(500).json({ error: 'Failed to fetch new collections' });
  }
});

// Creating Endpoint for related products data
app.get('/relatedproducts/:id', async (req, res) => {
  try {
    // Define a fixed set of product IDs that you want to always show
    const fixedProductIds = [1, 2, 3, 4]; // Replace with actual product IDs

    // Fetch these products from the database
    const relatedProducts = await Product.find({ id: { $in: fixedProductIds } });

    if (relatedProducts.length === 0) {
      return res.status(404).send({ error: "Related products not found" });
    }

    console.log("Fixed related products fetched:", relatedProducts);
    res.send(relatedProducts);
  } catch (error) {
    console.error('Error fetching related products:', error);
    res.status(500).send('Server Error');
  }
});

// Creating endpoint for popular in women section 
app.get('/popularinwomen', async (req, res) => {
  try {
    let products = await Product.find({ category: "women" });
    let popular_in_women = products.slice(0, 4);
    console.log("Popular in women fetched");
    res.send(popular_in_women);
  } catch (error) {
    console.error('Error fetching popular in women:', error);
    res.status(500).json({ error: 'Failed to fetch popular products' });
  }
});

// Middleware to fetch user
const fetchUser = async (req, res, next) => {
  const token = req.header('auth-token');
  if (!token) {
    return res.status(401).send({ errors: "Please Authenticate using valid token" });
  } else {
    try {
      const data = jwt.verify(token, process.env.JWT_SECRET);
      req.user = data.user;
      next();
    } catch (error) {
      res.status(401).send({ errors: "Please Authenticate using valid token" });
    }
  }
};

// Creating endpoint for adding products to cartdata
app.post('/addtocart', fetchUser, [
  body('itemId').isNumeric().withMessage('Item ID must be a number'),
  body('size').notEmpty().withMessage('Size is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { itemId, size } = req.body;
  try {
    let userData = await Users.findOne({ _id: req.user.id });

    if (!userData.cartData[itemId]) {
      userData.cartData[itemId] = {};
    }
    if (!userData.cartData[itemId][size]) {
      userData.cartData[itemId][size] = 0;
    }
    userData.cartData[itemId][size] += 1;

    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("Added");
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).send('Server Error');
  }
});

// Creating endpoint for removing products from cartdata
app.post('/removefromcart', fetchUser, [
  body('itemId').isNumeric().withMessage('Item ID must be a number'),
  body('size').notEmpty().withMessage('Size is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { itemId, size } = req.body;
  try {
    let userData = await Users.findOne({ _id: req.user.id });

    if (userData.cartData[itemId] && userData.cartData[itemId][size] > 0) {
      userData.cartData[itemId][size] -= 1;
    }

    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("Removed");
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).send('Server Error');
  }
});

// Creating endpoint to get cartdata
app.get('/getcart', fetchUser, async (req, res) => {
  try {
    console.log("GetCart");
    let userData = await Users.findOne({ _id: req.user.id });
    res.json(userData.cartData);
  } catch (error) {
    console.error('Error fetching cart data:', error);
    res.status(500).send('Server Error');
  }
});

// Stripe integration
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Load Stripe secret key from environment variable

app.post('/create-checkout-session', async (req, res) => {
  const { lineItems } = req.body;

  try {
    // Create a new Checkout Session with the provided line items
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: 'https://rossoecom.netlify.app/success?session_id={CHECKOUT_SESSION_ID}', // Appending session_id
      cancel_url: 'https://rossoecom.netlify.app/cancel',
      shipping_address_collection: {
        allowed_countries: [
          'US', 'CA', 'AR', 'GB', 'AU', 'FR', 'DE', 'IT', 'ES', 'NL', 'BR', 'JP'
          // Add more country codes as needed
        ],
      },
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).send('Server Error');
  }
});

app.listen(port, (error) => {
  if (!error) {
    console.log("Server Running on Port " + port);
  } else {
    console.error("Error: " + error);
  }
});
