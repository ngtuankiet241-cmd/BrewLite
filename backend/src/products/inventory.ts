import { Prisma } from '@prisma/client';

type RecipeIngredient = {
  sizeId: string;
  quantity: Prisma.Decimal;
  ingredient: { stock: Prisma.Decimal };
};

export function calculateStockBySize(
  recipes: RecipeIngredient[],
): Record<'S' | 'M' | 'L', number> {
  const sizes = ['S', 'M', 'L'] as const;
  const result: Record<'S' | 'M' | 'L', number> = { S: 0, M: 0, L: 0 };
  for (const sizeId of sizes) {
    const sizeRecipes = recipes.filter((recipe) => recipe.sizeId === sizeId);
    if (sizeRecipes.length === 0) continue;

    result[sizeId] = sizeRecipes.reduce((available, recipe) => {
      const ingredientStock = new Prisma.Decimal(
        recipe.ingredient.stock.toString(),
      );
      const recipeQuantity = new Prisma.Decimal(recipe.quantity.toString());
      return Math.min(
        available,
        ingredientStock.div(recipeQuantity).floor().toNumber(),
      );
    }, Number.MAX_SAFE_INTEGER);
  }
  return result;
}
