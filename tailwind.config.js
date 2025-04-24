/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.{ejs,html}", // Add the path to your EJS templates
    "./public/**/*.js"        // Add paths to any JavaScript files
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};


