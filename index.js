'use strict';

const https       = require('https');
const querystring = require('querystring');
const doc         = require('dynamodb-doc');
const dynamo      = new doc.DynamoDB();

function getCurrentProgram() {
  return new Promise((resolve, reject) => {
    let currentProgram = "";
    https.get({
      hostname: "www.scpr.org",
      protocol: "https:",
      path: `/api/v3/schedule/current`
    }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (d) => {
        currentProgram += d;
      });
      res.on('end', () => {
        currentProgram = JSON.parse(currentProgram).schedule_occurrence;
        if(currentProgram){
          resolve(currentProgram);
        } else {
          reject('current program not found');
        }
      });
    });
  });
}

function getHeadline(currentProgram){
  return new Promise((resolve, reject) => {
    let program = currentProgram.program || {};
    let host    = program.host;
    if(program.slug){
      https.get({
        hostname: "www.scpr.org",
        protocol: "https:",
        path: `/api/v3/episodes?program=${program.slug}&limit=1`
      }, (res) => {
        let episode = '';
        res.setEncoding('utf8');
        res.on('data', (d) => {
          episode += d;
        });
        res.on('end', () => {
          episode = JSON.parse(episode).episodes[0] || {};
          // OK, so lemme explain...
          // I'm assuming here that an episode that was published for
          // the program in the last two hours probably represents the
          // episode that is currently airing, in which case it is probably
          // safe to use the headline from said episode.  Otherwise,
          // we don't include the headline.
          let airDate = new Date(episode.air_date || "1989-03-15T09:50:00.000-07:00");
          let now     = new Date();
          now.setHours(now.getHours() - 2); // subtract 2 hours
          if (airDate > now){
            resolve({
              title: currentProgram.title,
              headline: episode.title
            })
          } else {
            reject('no episode or episode not new - could not get a headline');
          }
        });
      });
    } else {
      reject('program has no slug');
    }
  });
}

function constructMessage(options) {
  return new Promise((resolve, reject) => {
    options.title    = (options.title || '').replace('®','');
    options.headline = options.headline ? `- ${options.headline}` : '';
    if(options.headline.length){ options.host = null; }
    options.host     = options.host     ? `w/ ${options.host}` : '';
    resolve(`#OnAir ${options.title} ${options.host} ${options.headline}\r\n 📻 kpcc.org/listenlive`);
  });
}

function postMessage (message){
  return new Promise((resolve, reject) => {
    let postData = querystring.stringify({
      'message': message
    });
    let req = https.request({
      hostname: "graph.facebook.com",
      protocol: "https:",
      path: `/${process.env.PAGE_ID}/feed?access_token=${process.env.CLIENT_ACCESS_TOKEN}`,
      method: "POST",
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      resolve(message);
    });
    req.write(postData);
    req.end();
  });
}

function throttle(message) {
  // We will only allow a message to
  // continue on if it has not already
  // been posted earlier.
  return new Promise((resolve, reject) => {
    dynamo.getItem({
      TableName: "kpcc-on-air",
      Key: {message: message}
    }, function(err, obj){
      if(err || !Object.keys(obj).length){
        resolve(message);
      } else {
        reject('message has already been sent');
      }
    });
  });
}

function recordMessage(message) {
  // Cache the message so we can throttle
  // any duplicate messages.
  return new Promise((resolve, reject) => {
    dynamo.putItem({
      TableName: "kpcc-on-air",
      Item: {
        message: message,
        TTL: (new Date().getTime()) + 10000000
      }
    }, function(err){
      if(err){
        reject(err);
      } else {
        resolve(null, message);
      }
    });
  });
}

exports.handler = (event, context, callback) => {
  getCurrentProgram()
    .then(getHeadline)
    .then(constructMessage)
    .then(throttle)
    .then(postMessage)
    .then(recordMessage)
    .then(callback)
    .catch(e => callback(e));
};

