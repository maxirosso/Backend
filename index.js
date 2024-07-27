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
const fs = require('fs');

const port = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Database connection with MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

// API creation
app.get("/", (req, res) => {
    res.send("Express App is running");
});

// Image Storage Engine (temporary storage for Cloudinary)
const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage: storage });

// Create Upload endpoint for images
app.use('/images', express.static('upload/images'));

app.post("/upload", upload.single('product'), async (req, res) => {
    try {
        // Upload image to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path);

        // Remove local file
        fs.unlinkSync(req.file.path);

        res.json({
            success: 1,
            image_url: result.secure_url
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).send('Server Error');
    }
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

// Create Product endpoint
app.post('/addproduct', async (req, res) => {
    let products = await Product.find({});
    let id;
    if (products.length > 0) {
        let last_product = products.slice(-1)[0];
        id = last_product.id + 1;
    } else {
        id = 1;
    }
    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image, // Store the full Cloudinary URL
        category: req.body.category,
        new_price: req.body.new_price,
        old_price: req.body.old_price,
        description: req.body.description,
        sizes: req.body.sizes
    });
    console.log(product);
    await product.save();
    console.log("Saved");
    res.json({
        success: 1,
        name: req.body.name
    });
});

// Delete Product endpoint
app.post('/removeproduct', async (req, res) => {
    await Product.findOneAndDelete({ id: req.body.id });
    console.log("Removed");
    res.json({
        success: true,
        name: req.body.name
    });
});

// Get All Products endpoint
app.get('/allproducts', async (req, res) => {
    let products = await Product.find({});
    console.log("All Products Fetched");
    res.send(products);
});

// New Collections endpoint
app.get('/newcollections', async (req, res) => {
    let products = await Product.find({});
    let newcollection = products.slice(1).slice(-8);
    console.log("NewCollection Fetched");
    res.send(newcollection);
});

// Related Products endpoint
app.get('/relatedproducts/:id', async (req, res) => {
    try {
        // Define a fixed set of product IDs to always show
        const fixedProductIds = [1, 2, 3, 4]; // Replace with actual product IDs
        const relatedProducts = await Product.find({ id: { $in: fixedProductIds } });

        if (relatedProducts.length === 0) {
            return res.status(404).send({ error: "Related products not found" });
        }

        console.log("Fixed related products fetched:", relatedProducts);
        res.send(relatedProducts);
    } catch (error) {
        console.error("Error fetching related products:", error);
        res.status(500).send('Server Error');
    }
});

// Popular in Women section endpoint
app.get('/popularinwomen', async (req, res) => {
    let products = await Product.find({ category: "women" });
    let popular_in_women = products.slice(0, 4);
    console.log("Popular in women fetched");
    res.send(popular_in_women);
});

// User Schema
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

// Register User endpoint
app.post('/signup', async (req, res) => {
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

    await user.save();

    const data = {
        user: {
            id: user.id
        }
    };

    const token = jwt.sign(data, process.env.JWT_SECRET);
    res.json({ success: true, token });
});

// Login User endpoint
app.post('/login', async (req, res) => {
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
            res.json({ success: false, errors: "Wrong Password" });
        }
    } else {
        res.json({ success: false, errors: "Wrong Email Id" });
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

// Add to Cart endpoint
app.post('/addtocart', fetchUser, async (req, res) => {
    const { itemId, size } = req.body;
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
});

// Remove from Cart endpoint
app.post('/removefromcart', fetchUser, async (req, res) => {
    const { itemId, size } = req.body;
    let userData = await Users.findOne({ _id: req.user.id });

    if (userData.cartData[itemId] && userData.cartData[itemId][size] > 0) {
        userData.cartData[itemId][size] -= 1;
    }

    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("Removed");
});

// Get Cart Data endpoint
app.get('/getcart', fetchUser, async (req, res) => {
    try {
        console.log("GetCart");
        let userData = await Users.findOne({ _id: req.user.id });
        res.json(userData.cartData);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// Stripe Integration
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/create-checkout-session', async (req, res) => {
    const { lineItems } = req.body;

    try {
        // Create a new Checkout Session with the provided line items
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: 'https://rossoecom.netlify.app/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://rossoecom.netlify.app/cancel',
            shipping_address_collection: {
                allowed_countries: [
                    'US', 'CA', 'AR', 'GB', 'AU', 'FR', 'DE', 'IT', 'ES', 'NL', 'BR', 'JP'
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
        console.log("Error: " + error);
    }
});
