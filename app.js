//jshint esversion:10
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
  }//checks if in dev stage or not
//node requires

const bcrypt = require('bcrypt');
const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
const express = require('express');
const ejs = require('ejs');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const methodOverride = require('method-override');
const app = express();

//Using in server
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(methodOverride('_method'));
app.set('view engine', 'ejs');
app.use(express.static('public'));
//authentication  system
const initializePassport = require('./passport-config');//icluding the passport configurations in our main server
initializePassport(
  passport,
  email => users.find(user => user.email === email),
  id => users.find(user => user.id === id)
);

const users = [];//We will store the info of users in this array

app.use(flash());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));

app.get('/', checkAuthenticated, (req, res) => {
  res.render('index', { name: req.user.name });
});

app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('login');
});

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}));

app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register.ejs');
});

app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    users.push({
      id: Date.now().toString(),//Just acts as an id as we are authenticating loclly if we connect to db remove this as this is automatically assigned
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword
    });
    res.redirect('/login');
  } catch {
    res.redirect('/register');
  }
});

app.delete('/logout', (req, res) => {
  req.logOut();
  res.redirect('/login');
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.redirect('/login');
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  next();
}

//mongo uri

const mongoUri = 'mongodb://localhost:27017/musicDB';
const conn = mongoose.createConnection(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

//gfs init gridfs
let gfs;

conn.once('open', () => {
  //init stream
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('uploads');
});

//create storage engine
const storage = new GridFsStorage({
  url: mongoUri,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        const filename = file.originalname;
        const fileInfo = {
          filename: filename,
          bucketName: 'uploads'
        };
        resolve(fileInfo);
      });
    });
  }
});

const upload = multer({
  storage
});
//home route
app.get('/', (req, res) => {
  res.render('index');
});
//upload route
app.get('/upload', (req, res) => {
  res.render('add');
});
//uploading files to db
app.post('/upload', upload.single('file'), (req, res) => {
  // res.json({
  //   file: req.file
  // });
  res.redirect('/view');
});
//view files as raw data
app.get('/files', (req, res) => {
  gfs.files.find().toArray((err, files) => {
    if (!files || files.length === 0) {
      return res.status(404).json({
        err: 'No files exist'
      });
    }
    return res.json(files);
  });
});
//view route
app.get('/view', (req, res) => {
  gfs.files.find().toArray((err, files) => {
    if (!files || files.length === 0) {
      res.render('view', {
        files: false
      });
    } else {
      files.map(file => {
        if (file.contentType === 'audio/mpeg') {
          file.isMusic = true;
        } else {
          file.isMusic = false;
        }
      });
      res.render('view', {
        files: files
      });
    }
  });
});
//finding individual file
app.get('/files/:filename', (req, res) => {
  gfs.files.findOne({
    filename: req.params.filename
  }, (err, file) => {
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exist'
      });
    }

    return res.json(file);
  });
});
//for getting the audio using in ejs module
app.get('/audio/:filename', (req, res) => {
  gfs.files.findOne({
    filename: req.params.filename
  }, (err, file) => {
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exist'
      });
    }
    //checking if content was song or not if not no display
    if (file.contentType === 'audio/mpeg') {
      const readstream = gfs.createReadStream(file.filename);
      readstream.pipe(res);
    } else {
      res.status(404).json({
        err: 'Not a audio file'
      });
    }
  });
});
//deleting the song
app.delete('/files/:id',(req,res)=>{
  gfs.remove({_id:req.params.id, root:'uploads'},(err, gridStore)=>{
    if(err){
      return res.status(404).json({err:err});
    }

    res.redirect('/view');
  });
});
//port 3000 for local server
const port = 3000;
app.listen(port, () => {
  console.log(`Server Listening On http://localhost:${port}`);
});
