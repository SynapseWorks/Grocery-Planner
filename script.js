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

// State containers
let ingredients = [];
let pantry = [];
let groceryList = [];
let savedRecipes = JSON.parse(localStorage.getItem('savedRecipes') || '[]');

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
    pantry.map((name) => ({ name })),
    {
      removable: true,
      removeCallback: (index) => {
        pantry.splice(index, 1);
        displayPantry();
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
      ingredients = [...recipe.ingredients];
      displayIngredients();
    });
    li.appendChild(loadBtn);
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
  const pantrySet = new Set(pantry.map((i) => normalizeIngredient(i)));
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
        pantry.push(item);
        document.getElementById('pantry-input').value = '';
        displayPantry();
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
      const recipe = {
        id: Date.now(),
        name: name.trim(),
        ingredients: [...ingredients],
      };
      savedRecipes.push(recipe);
      localStorage.setItem('savedRecipes', JSON.stringify(savedRecipes));
      displaySavedRecipes();
      alert('Recipe saved!');
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