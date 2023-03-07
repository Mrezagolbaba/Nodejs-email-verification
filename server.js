var express = require('express');
var bodyParser = require('body-parser');
var nodemailer = require("nodemailer");
var redis = require("redis");
var redisClient = redis.createClient();
var mandrillTransport= require('nodemailer-mandrill-transport');
var async = require("async")
var app = express();

/*
    * Here we are configuring our SMTP Server details.
    * STMP is mail server which is responsible for sending and receiving email.
  * We are using Mandrill here.
*/

var smtpTransport = nodemailer.createTransport(mandrillTransport({
    auth: {
      apiKey : ''
    }
}));
/*------------------SMTP Over-----------------------------*/

var host = "localhost:3000";
app.use(bodyParser.urlencoded({"extended" : false}));
/* Sending index.html to browser */
app.get('/',function(req,res){
    res.sendFile(__dirname + "/index.html");
});
/*------------------SMTP Code-----------------------------*/
app.post('/send',function(req,res){
  console.log(req.body.to);
  async.waterfall([
    function(callback) {
      redisClient.get(req.body.to, function(err, reply) {
        if (reply==1) {
          callback(true, "Email already sent");
        } else if (err) {
          callback(true, "Error in redis");
        }
        callback(null)  
      });
    },
    function(callback){
    //generate random string
    let randomString = Math.random().toString(36).substring(7);
    let encodedMail = new Buffer(req.body.to).toString('base64');
    let link = "http://"+req.get(host)+"/verify?mail="+encodedMail+"&id="+randomString;
    var mailOptions={
        to : req.body.to,
        from:'m.reza.golbab@gmail.com',
        subject : "Please confirm your Email account",
        html : "Hello,<br> Please Click on the link to verify your email.<br><a href="+link+">Click here to verify</a>"
    };
    callback(null, mailOptions, randomString);
    },
    function(mailData,secretKey,callback){
    console.log(mailData);
    //send mail
    smtpTransport.sendMail(mailData, function(error, response){
      if(error){
        callback(true, "Error in sending mail");
      }
      console.log("Message sent: " + JSON(response.message));
      redisClient.set(req.body.to, secretKey);
      redisClient.expire(req.body.to, 600);//expire in 10 minutes
      callback(null, "Mail sent successfully");
    });
    }
  ], function(err, result) {
    console.log(err,result);
    res.json({error:err===null?false:true,message:result});
  });
});
/*------------------SMTP Over-----------------------------*/

app.get('/verify',function(req,res) {
  if((req.protocol+"://"+req.get('host'))==("http://"+host)) {
    async.waterfall([
      function(callback) {
        let decodedMail = new Buffer(req.query.mail, 'base64').toString('ascii');
        redisClient.get(decodedMail, function(err, reply) {
          if(err) {
            return callback(true,"Error in redis");
          }
          if(reply !== 1) {
            return callback(true,"Issue in redis");
          }
         callback(null,decodedMail,reply);

        });
      },
      function(key,redisData,callback) {
        if(redisData === req.query.id) {
          redisClient.del(key,function(err,reply) {
            if(err) {
              return callback(true,"Error in redis");
            }
            if(reply !== 1) {
              return callback(true,"Issue in redis");
            }
            callback(null,"Email is verified");
          });
        } else {
          return callback(true,"Invalid token");
        }
      }
    ],function(err,data) {
      res.send(data);
    });
  } else {
    res.end("Request is from unknown source");
  }
});

/*--------------------Routing Over----------------------------*/

app.listen(3000,function(){
  console.log("Express Started on Port 3000");
});

