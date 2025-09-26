// Netlify serverless function to extract ingredients from a recipe URL.
//
// Many recipe websites embed structured data using JSON‑LD with the
// "Recipe" schema. This function fetches the remote HTML and looks for
// <script type="application/ld+json"> blocks containing recipe data.
// If a recipe is found, its `recipeIngredient` array is returned. If
// multiple recipe objects are present, their ingredients are merged.

exports.handler = async (event) => {
  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing url parameter' }),
    };
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch URL' }),
      };
    }
    const html = await response.text();
    const ingredients = [];
    // Match all JSON‑LD script blocks
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const jsonText = match[1].trim();
      try {
        const data = JSON.parse(jsonText);
        const nodes = Array.isArray(data) ? data : [data];
        nodes.forEach((node) => {
          const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
          if (types && types.includes('Recipe') && Array.isArray(node.recipeIngredient)) {
            ingredients.push(...node.recipeIngredient);
          }
        });
      } catch (err) {
        // silently skip malformed JSON
      }
    }
    // Prepare final ingredients. If JSON‑LD extraction found none, attempt fallback.
    let finalIngredients = ingredients;
    if (finalIngredients.length === 0) {
      try {
        // Extract candidate ingredient lines from list items in the HTML. This is a
        // heuristic fallback for pages without JSON‑LD. Only include lines that
        // contain numbers or measurement words to avoid picking up directions.
        const liMatches = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
        const candidates = liMatches
          .map((m) => m[1]
            // Remove inner HTML tags
            .replace(/<[^>]+>/g, '')
            // Replace common HTML entities with spaces or ampersands
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .trim())
          .filter((text) => {
            return text && /\d|cup|tablespoon|teaspoon|tsp|tbsp|ounce|oz|gram|g|ml|kg/i.test(text);
          });
        if (candidates.length > 0) {
          // Attempt to parse ingredients via Zestful if an API key is provided.
          const apiKey = process.env.ZESTFUL_API_KEY;
          if (apiKey) {
            try {
              const zestResponse = await fetch('https://api.zestfuldata.com/parseIngredients', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': apiKey,
                },
                body: JSON.stringify({ ingredients: candidates }),
              });
              if (zestResponse.ok) {
                const zestData = await zestResponse.json();
                if (zestData && Array.isArray(zestData.results)) {
                  const parsed = zestData.results
                    .map((res) => res.ingredient || res.name || res.original || '')
                    .filter(Boolean);
                  if (parsed.length > 0) {
                    finalIngredients = parsed;
                  }
                }
              }
            } catch (apiErr) {
              // If the API call fails, fallback to using the raw candidates
            }
          }
          // If we still have no parsed ingredients, use raw candidate lines
          if (finalIngredients.length === 0) {
            finalIngredients = candidates;
          }
        }
      } catch (fallbackErr) {
        // swallow fallback errors
      }
    }
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Allow cross‑origin requests from the frontend running on Netlify
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ ingredients: finalIngredients }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
