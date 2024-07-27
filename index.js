require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { body, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(cors({
  origin: 'https://rossoecom.netlify.app',
  optionsSuccessStatus: 200
}));

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
    folder: 'uploads',
    format: async (req, file) => 'png',
    public_id: (req, file) => `${file.fieldname}_${Date.now()}`
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
    type: [String],
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
    image: req.body.image.split('/').pop(),
    category: req.body.category,
    new_price: req.body.new_price,
    old_price: req.body.old_price,
    description: req.body.description,
    sizes: req.body.sizes
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

app.get('/relatedproducts/:id', async (req, res) => {
  try {
    const fixedProductIds = [1, 2, 3, 4];
    const relatedProducts = await Product.find({ id: { $in: fixedProductIds } });
    console.log("Related Products Fetched");
    res.send(relatedProducts);
  } catch (error) {
    console.error('Error fetching related products:', error);
    res.status(500).json({ error: 'Failed to fetch related products' });
  }
});

app.post('/checkout', async (req, res) => {
  const items = req.body.items;
  let lineItems = [];
  items.forEach((item) => {
    lineItems.push({
      price: item.id,
      quantity: item.quantity
    });
  });

  const session = await stripe.checkout.sessions.create({
    shipping_address_collection: {
      allowed_countries: ['US', 'CA'],
    },
    line_items: lineItems,
    mode: 'payment',
    success_url: 'http://localhost:3000/success',
    cancel_url: 'http://localhost:3000/cancel'
  });

  res.send(JSON.stringify({
    id: session.id
  }));
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
