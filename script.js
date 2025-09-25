/*
 * Main application logic for the Grocery Planner.
 *
 * This script wires up event handlers for recipe fetching, manual entry,
 * pantry management, grocery list generation and receipt scanning. It
 * leverages a Netlify serverless function (recipeExtractor) to pull
 * ingredient lists from arbitrary recipe URLs by parsing their
 * JSON‑LD metadata. Ingredient categorization and list persistence are
 * handled entirely on the client using localStorage.
 */

// Replace with your own Zestful API key if you want ingredient parsing.
const ZESTFUL_API_KEY = '';

/*
 * Single‑user authentication.
 * The app checks against these credentials before allowing access. You can
 * change AUTH_USERNAME and AUTH_PASSWORD to your preferred values. A
 * simple token is stored in localStorage once the user logs in so they
 * remain authenticated across reloads on the same device. For more
 * sophisticated authentication, consider using Firebase Authentication.
 */
const AUTH_USERNAME = 'user';
const AUTH_PASSWORD = 'password123';

/*
 * Firebase configuration. Replace the placeholder values with your own
 * Firebase project settings (found in your Firebase console). Firestore
 * offers a generous free tier with 1 GiB storage and 50k reads per day【685750844728363†L1419-L1433】.
 */
const firebaseConfig = {
  apiKey: "AIzaSyBWxgNPsR0MPsoyM0Po9XxuSmK9kEySS1Y",
  authDomain: "grocery-planner-10c99.firebaseapp.com",
  projectId: "grocery-planner-10c99",
  storageBucket: "grocery-planner-10c99.firebasestorage.app",
  messagingSenderId: "2067957623",
  appId: "1:2067957623:web:0b66798f7f75c951ca4372",
  measurementId: "G-7FXJQST5N3"
};

// Initialize Firebase and Firestore if the SDKs are loaded. The compat
// versions attached via script tags expose the global `firebase` object.
let db;
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}

// State containers
// `ingredients` holds raw strings collected from recipes or manual input.
let ingredients = [];
// `pantry` is an array of objects { id: <doc id or timestamp>, name: <string> }
// When loading from Firestore, `id` corresponds to the document id for deletion.
let pantry = [];
// `groceryList` contains objects { name: <string>, category: <string> }
let groceryList = [];
// `savedRecipes` will be loaded from Firestore. Each recipe has an id, name and ingredients array.
let savedRecipes = [];

// Load pantry items and recipes from Firestore
async function loadData() {
  // If Firestore is not available, attempt to load localStorage fallbacks
  if (!db) {
    try {
      const pantryStr = localStorage.getItem('pantry');
      pantry = pantryStr ? JSON.parse(pantryStr) : [];
      const recipesStr = localStorage.getItem('savedRecipes');
      savedRecipes = recipesStr ? JSON.parse(recipesStr) : [];
      displayPantry();
      displaySavedRecipes();
    } catch (err) {
      console.warn('No Firestore available and local data could not be loaded', err);
    }
    return;
  }
  try {
    // Load pantry
    const pantrySnap = await db.collection('pantry').get();
    // Keep the document id to enable deletions later.
    pantry = pantrySnap.docs.map((doc) => ({ id: doc.id, name: doc.data().name }));
    displayPantry();
    // Load recipes
    const recipesSnap = await db.collection('recipes').get();
    savedRecipes = recipesSnap.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      ingredients: doc.data().ingredients,
    }));
    displaySavedRecipes();
  } catch (err) {
    console.error('Error loading data from Firestore:', err);
  }
}

// Authentication handling
function checkLogin() {
  const token = localStorage.getItem('authToken');
  const modal = document.getElementById('login-modal');
  if (token === 'loggedIn') {
    if (modal) modal.style.display = 'none';
    loadData();
  } else {
    if (modal) modal.style.display = 'flex';
  }
}

function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    localStorage.setItem('authToken', 'loggedIn');
    const modal = document.getElementById('login-modal');
    if (modal) modal.style.display = 'none';
    loadData();
  } else {
    alert('Invalid username or password.');
  }
}

// Utility: convert a string to a canonical ingredient name
function normalizeIngredient(item) {
  return item.trim().toLowerCase();
}

// Render functions
function renderList(listEl, items, options = {}) {
  listEl.innerHTML = '';
  items.forEach((itemObj, index) => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = itemObj.name || itemObj;
    li.appendChild(nameSpan);

    // Show category if provided
    if (itemObj.category) {
      const catSpan = document.createElement('span');
      catSpan.textContent = itemObj.category;
      catSpan.classList.add('category');
      li.appendChild(catSpan);
    }

    if (options.removable) {
      const btn = document.createElement('button');
      btn.textContent = '✕';
      btn.classList.add('remove-btn');
      btn.addEventListener('click', () => {
        options.removeCallback(index);
      });
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  });
}

function displayIngredients() {
  const listEl = document.getElementById('ingredients-list');
  renderList(
    listEl,
    ingredients.map((name) => ({ name })),
    {
      removable: true,
      removeCallback: (index) => {
        ingredients.splice(index, 1);
        displayIngredients();
      },
    },
  );
}

function displayPantry() {
  const listEl = document.getElementById('pantry-list');
  renderList(
    listEl,
    pantry,
    {
      removable: true,
      removeCallback: (index) => {
        const removed = pantry.splice(index, 1)[0];
        displayPantry();
        // Remove from Firestore if available and id exists
        if (db && removed && removed.id) {
          db.collection('pantry')
            .doc(removed.id)
            .delete()
            .catch((err) => {
              console.error('Failed to delete pantry item:', err);
            });
        } else {
          // Update localStorage fallback
          localStorage.setItem('pantry', JSON.stringify(pantry));
        }
      },
    },
  );
}

function displayGroceryList() {
  const listEl = document.getElementById('grocery-list');
  renderList(
    listEl,
    groceryList,
    {
      removable: true,
      removeCallback: (index) => {
        groceryList.splice(index, 1);
        displayGroceryList();
      },
    },
  );
}

function displaySavedRecipes() {
  const listEl = document.getElementById('saved-recipes-list');
  listEl.innerHTML = '';
  savedRecipes.forEach((recipe, index) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = recipe.name;
    li.appendChild(name);
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.classList.add('remove-btn');
    loadBtn.addEventListener('click', () => {
      // Replace the current ingredients with this recipe's ingredients and update display
      ingredients = [...recipe.ingredients];
      displayIngredients();
    });
    li.appendChild(loadBtn);
    // Add a delete button to remove a saved recipe
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '✕';
    deleteBtn.classList.add('remove-btn');
    deleteBtn.addEventListener('click', () => {
      if (confirm('Delete this saved recipe?')) {
        savedRecipes.splice(index, 1);
        displaySavedRecipes();
        if (db && recipe.id) {
          db.collection('recipes')
            .doc(recipe.id)
            .delete()
            .catch((err) => {
              console.error('Failed to delete recipe:', err);
            });
        } else {
          // Fall back to localStorage update
          localStorage.setItem('savedRecipes', JSON.stringify(savedRecipes));
        }
      }
    });
    li.appendChild(deleteBtn);
    listEl.appendChild(li);
  });
}

// Category mapping for grocery sections
const categoryMap = {
  Produce: [
    'apple',
    'banana',
    'carrot',
    'broccoli',
    'lettuce',
    'tomato',
    'potato',
    'onion',
    'garlic',
    'pepper',
    'spinach',
    'cilantro',
    'parsley',
    'celery',
    'cucumber',
    'mushroom',
    'ginger',
    'lime',
    'lemon',
  ],
  Dairy: ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'cream cheese'],
  Meat: ['chicken', 'beef', 'pork', 'sausage', 'bacon', 'ham', 'turkey'],
  Grains: ['bread', 'rice', 'pasta', 'flour', 'tortilla', 'cereal', 'oats'],
  Canned: ['beans', 'tomatoes', 'corn', 'tuna', 'soup'],
  Spices: ['salt', 'pepper', 'cumin', 'oregano', 'basil', 'thyme', 'coriander'],
  Condiments: [
    'oil',
    'olive oil',
    'vinegar',
    'soy sauce',
    'ketchup',
    'mustard',
    'mayonnaise',
  ],
  Beverages: ['juice', 'coffee', 'tea'],
};

function categorizeItem(item) {
  const normalized = normalizeIngredient(item);
  for (const [category, items] of Object.entries(categoryMap)) {
    if (items.some((i) => normalized.includes(i))) {
      return category;
    }
  }
  return 'Other';
}

// Generate grocery list based on ingredients and pantry
function generateGroceryList() {
  groceryList = [];
  const pantrySet = new Set(pantry.map((i) => normalizeIngredient(i.name || i)));
  ingredients.forEach((ing) => {
    const norm = normalizeIngredient(ing);
    if (!pantrySet.has(norm)) {
      groceryList.push({ name: ing.trim(), category: categorizeItem(ing) });
    }
  });
  displayGroceryList();
}

// Fetch ingredients from URL via Netlify function
async function fetchIngredientsFromUrl(url) {
  const response = await fetch(
    `/.netlify/functions/recipeExtractor?url=${encodeURIComponent(url)}`,
  );
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }
  return data.ingredients || [];
}

// Event handlers
window.addEventListener('DOMContentLoaded', () => {
  // Attach event listeners

  // Login handler
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  // Check authentication status on load
  checkLogin();
  document
    .getElementById('fetch-recipe-btn')
    .addEventListener('click', async () => {
      const url = document.getElementById('recipe-url').value.trim();
      if (!url) {
        alert('Please enter a recipe URL.');
        return;
      }
      try {
        const fetched = await fetchIngredientsFromUrl(url);
        ingredients = ingredients.concat(fetched);
        displayIngredients();
      } catch (err) {
        console.error(err);
        alert(
          'Unable to fetch recipe ingredients. You can paste them manually instead.',
        );
      }
    });

  document
    .getElementById('parse-manual-btn')
    .addEventListener('click', () => {
      const manual = document.getElementById('manual-ingredients').value;
      if (!manual.trim()) {
        alert('Please enter one or more ingredients.');
        return;
      }
      const lines = manual
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter((s) => s);
      ingredients = ingredients.concat(lines);
      document.getElementById('manual-ingredients').value = '';
      displayIngredients();
    });

  document
    .getElementById('add-pantry-btn')
    .addEventListener('click', () => {
      const item = document.getElementById('pantry-input').value.trim();
      if (item) {
        // Persist to Firestore if available, then update local pantry array with id
        if (db) {
          db.collection('pantry')
            .add({ name: item })
            .then((docRef) => {
              pantry.push({ id: docRef.id, name: item });
              document.getElementById('pantry-input').value = '';
              displayPantry();
            })
            .catch((err) => {
              console.error('Error adding pantry item:', err);
              // Fallback: add with a timestamp id
              const fallbackId = 'local-' + Date.now();
              pantry.push({ id: fallbackId, name: item });
              document.getElementById('pantry-input').value = '';
              displayPantry();
            });
        } else {
          // No Firestore: push to pantry with timestamp id and update localStorage fallback
          const fallbackId = 'local-' + Date.now();
          pantry.push({ id: fallbackId, name: item });
          document.getElementById('pantry-input').value = '';
          displayPantry();
          localStorage.setItem('pantry', JSON.stringify(pantry));
        }
      }
    });

  document
    .getElementById('generate-list-btn')
    .addEventListener('click', () => {
      generateGroceryList();
    });

  document
    .getElementById('add-grocery-btn')
    .addEventListener('click', () => {
      const item = document.getElementById('grocery-input').value.trim();
      if (item) {
        groceryList.push({ name: item, category: categorizeItem(item) });
        document.getElementById('grocery-input').value = '';
        displayGroceryList();
      }
    });

  document
    .getElementById('save-recipe-btn')
    .addEventListener('click', () => {
      if (ingredients.length === 0) {
        alert('No ingredients to save.');
        return;
      }
      const name = prompt('Enter a name for this recipe:', 'My Recipe');
      if (!name) {
        return;
      }
      const recipeName = name.trim();
      const recipe = {
        name: recipeName,
        ingredients: [...ingredients],
      };
      // Save to Firestore
      if (db) {
        db.collection('recipes')
          .add(recipe)
          .then((docRef) => {
            savedRecipes.push({ id: docRef.id, ...recipe });
            displaySavedRecipes();
            alert('Recipe saved!');
          })
          .catch((err) => {
            console.error('Error saving recipe:', err);
            alert('Failed to save recipe.');
          });
      } else {
        // Fall back to local storage if Firestore is unavailable
        savedRecipes.push({ id: Date.now(), ...recipe });
        localStorage.setItem('savedRecipes', JSON.stringify(savedRecipes));
        displaySavedRecipes();
        alert('Recipe saved locally.');
      }
    });

  document
    .getElementById('scan-receipt-btn')
    .addEventListener('click', async () => {
      const fileInput = document.getElementById('receipt-input');
      const file = fileInput.files[0];
      if (!file) {
        alert('Please select a receipt image.');
        return;
      }
      const receiptList = document.getElementById('receipt-items');
      receiptList.innerHTML = '<li>Processing image, please wait...</li>';
      try {
        const result = await Tesseract.recognize(file, 'eng');
        const text = result.data.text;
        const lines = text
          .split(/\n/)
          .map((l) => l.trim())
          .filter((l) => l);
        receiptList.innerHTML = '';
        lines.forEach((line) => {
          const li = document.createElement('li');
          li.textContent = line;
          receiptList.appendChild(li);
        });
      } catch (err) {
        console.error(err);
        receiptList.innerHTML = '';
        alert('Failed to scan receipt.');
      }
    });

  // Initial display
  displayIngredients();
  displayPantry();
  displayGroceryList();
  displaySavedRecipes();
});