/**
 * Starter Pokémon of every generation (grass, fire, water). The professor of the Adventure campaigns
 * (classic + Vietnam Odyssey) offers all of them; the campaign's own trio is shown first, in its own order.
 */

export interface StarterGen {
  gen: number;
  /** Region the trio comes from (shown on the generation tab). */
  region: string;
  species: string[];
}

export const STARTER_GENS: readonly StarterGen[] = [
  { gen: 1, region: 'Kanto', species: ['bulbasaur', 'charmander', 'squirtle'] },
  { gen: 2, region: 'Johto', species: ['chikorita', 'cyndaquil', 'totodile'] },
  { gen: 3, region: 'Hoenn', species: ['treecko', 'torchic', 'mudkip'] },
  { gen: 4, region: 'Sinnoh', species: ['turtwig', 'chimchar', 'piplup'] },
  { gen: 5, region: 'Unova', species: ['snivy', 'tepig', 'oshawott'] },
  { gen: 6, region: 'Kalos', species: ['chespin', 'fennekin', 'froakie'] },
  { gen: 7, region: 'Alola', species: ['rowlet', 'litten', 'popplio'] },
  { gen: 8, region: 'Galar', species: ['grookey', 'scorbunny', 'sobble'] },
  { gen: 9, region: 'Paldea', species: ['sprigatito', 'fuecoco', 'quaxly'] },
];

export const ALL_STARTERS: readonly string[] = STARTER_GENS.flatMap((g) => g.species);

/**
 * The generations offered by a campaign. The tab holding the campaign's trio comes first (that trio keeps the
 * campaign's order, so "1" still picks the first Pokémon the professor names); a trio outside the nine
 * generations becomes its own first tab.
 */
export function starterTabs(trio: readonly string[]): { tabs: StarterGen[]; first: number } {
  const tabs = STARTER_GENS.map((g) => ({ ...g, species: [...g.species] }));
  const i = tabs.findIndex((g) => trio.every((s) => g.species.includes(s)));
  if (i >= 0) {
    tabs[i].species = [...trio];
    return { tabs, first: i };
  }
  return { tabs: [{ gen: 0, region: 'Giáo sư', species: [...trio] }, ...tabs], first: 0 };
}
