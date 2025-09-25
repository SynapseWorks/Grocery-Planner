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
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Allow cross‑origin requests from the frontend running on Netlify
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ ingredients }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
