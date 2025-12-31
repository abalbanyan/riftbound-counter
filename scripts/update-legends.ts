import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE_URL = "https://api.riftcodex.com/cards";
const PAGE_SIZE = 100;

type Card = {
  name?: string;
  classification?: { type?: string };
  media?: { image_url?: string };
};

async function fetchLegends(): Promise<{ name: string; photoUrl: string }[]> {
  const legends: { name: string; photoUrl: string }[] = [];

  let page = 1;
  let pages = 1;

  while (page <= pages) {
    const res = await fetch(`${BASE_URL}?page=${page}&size=${PAGE_SIZE}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Fetch failed page ${page}: ${res.status}\n${body}`);
    }

    const data = (await res.json()) as { items?: Card[]; pages?: number };
    pages = Number(data.pages ?? 1);

    for (const card of data.items ?? []) {
      if (
        card?.classification?.type === "Legend" &&
        card?.name &&
        card?.media?.image_url
      ) {
        legends.push({
          name: card.name,
          photoUrl: card.media.image_url,
        });
      }
    }

    page++;
  }

  legends.sort((a, b) => a.name.localeCompare(b.name));
  return legends;
}

async function main() {
  const legends = await fetchLegends();

  const outPath = path.join(process.cwd(), "public", "legends.json");
  mkdirSync(path.dirname(outPath), { recursive: true });

  writeFileSync(outPath, JSON.stringify(legends, null, 2) + "\n", "utf8");
  console.log(`Wrote ${legends.length} legends to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
