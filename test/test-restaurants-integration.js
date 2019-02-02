'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const faker = require('faker');
const mongoose = require('mongoose');

// this makes the expect syntax available throughout
// this module
const expect = chai.expect;

const {Restaurant} = require('../models');
const {app, runServer, closeServer} = require('../server');
const {TEST_DATABASE_URL} = require('../config');

chai.use(chaiHttp);

// used to put randomish documents in db
// so we have data to work with and assert about.
// we use the Faker library to automatically
// generate placeholder values for author, title, content
// and then we insert that data into mongo
function seedRestaurantData() {
  console.info('seeding restaurant data');
  const seedData = [];

  for (let i=1; i<=10; i++) {
    seedData.push(generateRestaurantData());
  }
  // this will return a promise
  return Restaurant.insertMany(seedData);
}

// used to generate data to put in db
function generateBoroughName() {
  const boroughs = [
    'Manhattan', 'Queens', 'Brooklyn', 'Bronx', 'Staten Island'];
  return boroughs[Math.floor(Math.random() * boroughs.length)];
}

// used to generate data to put in db
function generateCuisineType() {
  const cuisines = ['Italian', 'Thai', 'Colombian'];
  return cuisines[Math.floor(Math.random() * cuisines.length)];
}

// used to generate data to put in db
function generateGrade() {
  const grades = ['A', 'B', 'C', 'D', 'F'];
  const grade = grades[Math.floor(Math.random() * grades.length)];
  return {
    date: faker.date.past(),
    grade: grade
  };
}

// generate an object represnting a restaurant.
// can be used to generate seed data for db
// or request.body data
function generateRestaurantData() {
  return {
    name: faker.company.companyName(),
    borough: generateBoroughName(),
    cuisine: generateCuisineType(),
    address: {
      building: faker.address.streetAddress(),
      street: faker.address.streetName(),
      zipcode: faker.address.zipCode()
    },
    grades: [generateGrade(), generateGrade(), generateGrade()]
  };
}


// this function deletes the entire database.
// we'll call it in an `afterEach` block below
// to ensure data from one test does not stick
// around for next one
function tearDownDb() {
  console.warn('Deleting database');
  return mongoose.connection.dropDatabase();
}

describe('Restaurants API resource', function() {

  // we need each of these hook functions to return a promise
  // otherwise we'd need to call a `done` callback. `runServer`,
  // `seedRestaurantData` and `tearDownDb` each return a promise,
  // so we return the value returned by these function calls.
  before(function() {
    //responsible for starting the server
    //note seperate database URL for tests!
    return runServer(TEST_DATABASE_URL);
  });

  beforeEach(function() {
    //seeds our database with test data before each test runs
    return seedRestaurantData();
  });

  afterEach(function() {
    //zeroes out our database after each test is run
    //ensures there are no dependencies between tests
    return tearDownDb();
  });

  after(function() {
    //calls close server after all tests are run
    return closeServer();
  });

  // note the use of nested `describe` blocks.
  // this allows us to make clearer, more discrete tests that focus
  // on proving something small
  describe('GET endpoint', function() {

    it('should return all existing restaurants', function() {
      // strategy:
      //    1. get back all restaurants returned by by GET request to `/restaurants`
      //    2. prove res has right status, data type
      //    3. prove the number of restaurants we got back is equal to number
      //       in db.
      //
      // need to have access to mutate and access `res` across
      // `.then()` calls below, so declare it here so can modify in place
      let res; 
      //declare a `res` variable so we have a place to store some data...
      //...across `.then` calls
      return chai.request(app)
        .get('/restaurants') //make get request to restaurants
        .then(function(_res) { //set response value to `_res`
          // so subsequent .then blocks can access response object
          res = _res; //res is now `_res` for this request
          expect(res).to.have.status(200); // otherwise our db seeding didn't work
          expect(res.body.restaurants).to.have.lengthOf.at.least(1);
          return Restaurant.count();
          //^^a Promise that will tell us the # of restaurants in the database
        })
        .then(function(count) { //take value returned by `Restaurant.count`
          expect(res.body.restaurants).to.have.lengthOf(count);
          //assert that the # of restaurants in our res object is the same as `count`
        });
    });


    it('should return restaurants with right fields', function() {
      // Strategy: Get back all restaurants, and ensure they have expected keys

      let resRestaurant;
      //declare a `resRestaurant` variable so we have a place to store some data...
      //...across `.then` calls
      return chai.request(app)
        .get('/restaurants') //make get request to restaurants
        .then(function(res) { //set response value to `_res`
          expect(res).to.have.status(200); // otherwise our db seeding didn't work
          expect(res).to.be.json;// shoudl be json object
          expect(res.body.restaurants).to.be.a('array'); //should be an array
          expect(res.body.restaurants).to.have.lengthOf.at.least(1); //should be at least 1

          res.body.restaurants.forEach(function(restaurant) { //iterate through JSON array
            expect(restaurant).to.be.a('object'); //check that all are objects
            expect(restaurant).to.include.keys( //check that all include these keys
              'id', 'name', 'cuisine', 'borough', 'grade', 'address');
          });
          resRestaurant = res.body.restaurants[0];
          //^^ `resRestaurant` is now first restaurant object in aray for this request
          return Restaurant.findById(resRestaurant.id);
          //get id value from restuarant object in `resRestaurant`
        })
        .then(function(restaurant) {
          // check that key value pairs of restaurant object `resRestaurant`
          //correspond with those in restaurant database
          expect(resRestaurant.id).to.equal(restaurant.id);
          expect(resRestaurant.name).to.equal(restaurant.name);
          expect(resRestaurant.cuisine).to.equal(restaurant.cuisine);
          expect(resRestaurant.borough).to.equal(restaurant.borough);
          expect(resRestaurant.address).to.contain(restaurant.address.building);

          expect(resRestaurant.grade).to.equal(restaurant.grade);
        });
    });
  });

  describe('POST endpoint', function() {
    // strategy: make a POST request with data,
    // then prove that the restaurant we get back has
    // right keys, and that `id` is there (which means
    // the data was inserted into db)
    it('should add a new restaurant', function() {

      const newRestaurant = generateRestaurantData();
      // ^we create an object containing data about a restaurant
      let mostRecentGrade;

      return chai.request(app)
        .post('/restaurants')
        // not post new data (`newRestaurant`) to `/restaurants` database
        .send(newRestaurant)
        .then(function(res) {
          expect(res).to.have.status(201);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body).to.include.keys(
            'id', 'name', 'cuisine', 'borough', 'grade', 'address');
          expect(res.body.name).to.equal(newRestaurant.name);
          // cause Mongo should have created id on insertion
          expect(res.body.id).to.not.be.null;
          expect(res.body.cuisine).to.equal(newRestaurant.cuisine);
          expect(res.body.borough).to.equal(newRestaurant.borough);

          mostRecentGrade = newRestaurant.grades.sort(
            (a, b) => b.date - a.date)[0].grade;
          //this assigns a value to `mostRecentGrade` that pulls the most recent 
          //value for the key `grades` in the `newRestaurant` object

          expect(res.body.grade).to.equal(mostRecentGrade);
          // check that `mostRecentGrade`  equals the 
          //key value grade in `restaurants` databse
          return Restaurant.findById(res.body.id);
          //get id value from restuarant object in `newRestaurant`
        })
        .then(function(restaurant) {
          // check that key value pairs in restaurant database
          //correspond with those in restaurant object `newRestaurant`
          expect(restaurant.name).to.equal(newRestaurant.name);
          expect(restaurant.cuisine).to.equal(newRestaurant.cuisine);
          expect(restaurant.borough).to.equal(newRestaurant.borough);
          expect(restaurant.grade).to.equal(mostRecentGrade);
          expect(restaurant.address.building).to.equal(newRestaurant.address.building);
          expect(restaurant.address.street).to.equal(newRestaurant.address.street);
          expect(restaurant.address.zipcode).to.equal(newRestaurant.address.zipcode);
        });
    });
  });

  describe('PUT endpoint', function() {

    // strategy:
    //  1. Get an existing restaurant from db
    //  2. Make a PUT request to update that restaurant
    //  3. Prove restaurant returned by request contains data we sent
    //  4. Prove restaurant in db is correctly updated
    it('should update fields you send over', function() {
      const updateData = {
        name: 'fofofofofofofof',
        cuisine: 'futuristic fusion'
      };
      //^^we create an object with the data we want to update

      return Restaurant
        .findOne()
        //^^we retrieve an existing restaurant from databse
        .then(function(restaurant) {
          updateData.id = restaurant.id;
          //^^ set id property on `updateData` to the .findOne id from database

          // make request then inspect it to make sure it reflects
          // data we sent
          return chai.request(app)
            .put(`/restaurants/${restaurant.id}`)
            .send(updateData);
          //^^return result request
        })
        .then(function(res) {
        //^^pull from returned res above (line 259)
          expect(res).to.have.status(204);
          return Restaurant.findById(updateData.id);
          // we expect a 204 status and request the resaurant
          //object from databse, based on updateData id
        })
        .then(function(restaurant) {
          expect(restaurant.name).to.equal(updateData.name);
          expect(restaurant.cuisine).to.equal(updateData.cuisine);
          // get updated restaurant from databse, and make sure the updated values
          // (name and cuisine) are actually updated!
        });
    });
  });

  describe('DELETE endpoint', function() {
    // strategy:
    //  1. get a restaurant
    //  2. make a DELETE request for that restaurant's id
    //  3. assert that response has right status code
    //  4. prove that restaurant with the id doesn't exist in db anymore
    it('delete a restaurant by id', function() {

      let restaurant;
      //^^we create an object with the data we want to delete
      return Restaurant
        .findOne()
        // get a restaurant object from database
        .then(function(_restaurant) {
          restaurant = _restaurant;
          // assign response `_resstaurant` object to `restaurant` variable
          return chai.request(app).delete(`/restaurants/${restaurant.id}`);
          //make delete request to database with id and return response
        })
        .then(function(res) {
          //receive response from databse
          expect(res).to.have.status(204);
          //expeet 204 status
          return Restaurant.findById(restaurant.id);
          //make request to database to find deleted restaurant object by id and return response
        })
        .then(function(_restaurant) {
          //response back shold confirm that restaurant is deleted/`null`
          expect(_restaurant).to.be.null;
        });
    });
  });
});
