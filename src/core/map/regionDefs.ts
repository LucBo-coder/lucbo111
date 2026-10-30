import valleyJson from '../../data/world/starter-valley.json';
import frozenJson from '../../data/world/frozen-mountains.json';
import volcanicJson from '../../data/world/volcanic-lands.json';
import sanctuaryJson from '../../data/world/legendary-sanctuary.json';
import swampJson from '../../data/world/misty-swamp.json';
import coastJson from '../../data/world/coral-coast.json';
import emeraldJson from '../../data/world/emerald-woods.json';
import abyssJson from '../../data/world/abyssal-depths.json';
import templeJson from '../../data/world/origin-temple.json';
import psychicRiftJson from '../../data/world/psychic-rift.json';
import rainbowSkyJson from '../../data/world/rainbow-sky.json';
import silverMaelstromJson from '../../data/world/silver-maelstrom.json';
import magmaCoreJson from '../../data/world/magma-core.json';
import skyPillarJson from '../../data/world/sky-pillar.json';
import distortionWorldJson from '../../data/world/distortion-world.json';
import valleyHollowJson from '../../data/world/valley-hollow.json';
import emeraldHollowJson from '../../data/world/emerald-hollow.json';
import coralHollowJson from '../../data/world/coral-hollow.json';
import frozenHollowJson from '../../data/world/frozen-hollow.json';
import volcanicHollowJson from '../../data/world/volcanic-hollow.json';
import sanctuaryHollowJson from '../../data/world/sanctuary-hollow.json';
import swampHollowJson from '../../data/world/swamp-hollow.json';
import caMauJson from '../../data/vietnam/ca-mau.json';
import anGiangJson from '../../data/vietnam/an-giang.json';
import canThoJson from '../../data/vietnam/can-tho.json';
import vinhLongJson from '../../data/vietnam/vinh-long.json';
import traVinhJson from '../../data/vietnam/tra-vinh.json';
import benTreJson from '../../data/vietnam/ben-tre.json';
import dongThapJson from '../../data/vietnam/dong-thap.json';
import tayNinhJson from '../../data/vietnam/tay-ninh.json';
import hoChiMinhJson from '../../data/vietnam/ho-chi-minh.json';
import dongNaiJson from '../../data/vietnam/dong-nai.json';
import lamDongJson from '../../data/vietnam/lam-dong.json';
import khanhHoaJson from '../../data/vietnam/khanh-hoa.json';
import dakLakJson from '../../data/vietnam/dak-lak.json';
import giaLaiJson from '../../data/vietnam/gia-lai.json';
import quangNgaiJson from '../../data/vietnam/quang-ngai.json';
import daNangJson from '../../data/vietnam/da-nang.json';
import hueJson from '../../data/vietnam/hue.json';
import quangTriJson from '../../data/vietnam/quang-tri.json';
import haTinhJson from '../../data/vietnam/ha-tinh.json';
import ngheAnJson from '../../data/vietnam/nghe-an.json';
import thanhHoaJson from '../../data/vietnam/thanh-hoa.json';
import ninhBinhJson from '../../data/vietnam/ninh-binh.json';
import hungYenJson from '../../data/vietnam/hung-yen.json';
import type { RegionDef } from './valley';

// Every overworld map of the game. The valley is the hub; the other regions are reached through portals.
export const REGION_DEFS: Record<string, RegionDef> = {
  'starter-valley': valleyJson as unknown as RegionDef,
  'frozen-mountains': frozenJson as unknown as RegionDef,
  'volcanic-lands': volcanicJson as unknown as RegionDef,
  'legendary-sanctuary': sanctuaryJson as unknown as RegionDef,
  'misty-swamp': swampJson as unknown as RegionDef,
  'coral-coast': coastJson as unknown as RegionDef,
  'emerald-woods': emeraldJson as unknown as RegionDef,
  // shrine planes (reached through a hidden entrance, not listed with the regions)
  'abyssal-depths': abyssJson as unknown as RegionDef,
  'origin-temple': templeJson as unknown as RegionDef,
  // tier-1 legendaries' dimensions, then each map's hidden sanctum (LEGENDARY_SHRINES.md mục 8)
  'psychic-rift': psychicRiftJson as unknown as RegionDef,
  'rainbow-sky': rainbowSkyJson as unknown as RegionDef,
  'silver-maelstrom': silverMaelstromJson as unknown as RegionDef,
  'magma-core': magmaCoreJson as unknown as RegionDef,
  'sky-pillar': skyPillarJson as unknown as RegionDef,
  'distortion-world': distortionWorldJson as unknown as RegionDef,
  'valley-hollow': valleyHollowJson as unknown as RegionDef,
  'emerald-hollow': emeraldHollowJson as unknown as RegionDef,
  'coral-hollow': coralHollowJson as unknown as RegionDef,
  'frozen-hollow': frozenHollowJson as unknown as RegionDef,
  'volcanic-hollow': volcanicHollowJson as unknown as RegionDef,
  'sanctuary-hollow': sanctuaryHollowJson as unknown as RegionDef,
  'swamp-hollow': swampHollowJson as unknown as RegionDef,
  // Vietnam Odyssey mode (separate campaign)
  'ca-mau': caMauJson as unknown as RegionDef,
  'an-giang': anGiangJson as unknown as RegionDef,
  'can-tho': canThoJson as unknown as RegionDef,
  'vinh-long': vinhLongJson as unknown as RegionDef,
  'tra-vinh': traVinhJson as unknown as RegionDef,
  'ben-tre': benTreJson as unknown as RegionDef,
  'dong-thap': dongThapJson as unknown as RegionDef,
  'tay-ninh': tayNinhJson as unknown as RegionDef,
  'ho-chi-minh': hoChiMinhJson as unknown as RegionDef,
  'dong-nai': dongNaiJson as unknown as RegionDef,
  'lam-dong': lamDongJson as unknown as RegionDef,
  'khanh-hoa': khanhHoaJson as unknown as RegionDef,
  'dak-lak': dakLakJson as unknown as RegionDef,
  'gia-lai': giaLaiJson as unknown as RegionDef,
  'quang-ngai': quangNgaiJson as unknown as RegionDef,
  'da-nang': daNangJson as unknown as RegionDef,
  'hue': hueJson as unknown as RegionDef,
  'quang-tri': quangTriJson as unknown as RegionDef,
  'ha-tinh': haTinhJson as unknown as RegionDef,
  'nghe-an': ngheAnJson as unknown as RegionDef,
  'thanh-hoa': thanhHoaJson as unknown as RegionDef,
  'ninh-binh': ninhBinhJson as unknown as RegionDef,
  'hung-yen': hungYenJson as unknown as RegionDef,
};

export function regionDef(id: string | null | undefined): RegionDef {
  return REGION_DEFS[id ?? ''] ?? REGION_DEFS['starter-valley'];
}

/** Which map an area id belongs to (quest markers / events only show on their own map). */
export function mapOfArea(areaId: string): string | null {
  for (const [id, d] of Object.entries(REGION_DEFS)) if (d.areas.some((a) => a.id === areaId)) return id;
  return null;
}
