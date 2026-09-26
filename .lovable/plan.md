# Make the knowledge map readable

## What's wrong

The "gremix mind" map tries to put **all 140 topics** around the center at once, and every topic always shows its name. Most of them appear in only one video ("(1)"), so you get a pile of overlapping bubbles and text. The map allows up to 300 bubbles at this first level. That's far too many.

## Fix

1. **Show only the main topics first.** The first view shows at most 20 topics: the ones that appear in the most videos. All the others go into one bubble, **"+120 more topics"**. Tapping it opens a searchable list, and picking one opens that topic.
2. **Group the one-off topics.** Topics seen in only one video go into **"Other topics (N)"** instead of each getting its own bubble. Topics that appear in 2 or more videos always come first.
3. **Names that don't overlap.** Names show only for the biggest bubbles and for the one you point at. Zoom in to see the rest. Long names are cut shorter.
4. **More room between bubbles** so they spread in a clean ring instead of piling up.
5. **Nothing is lost:** all 140 topics are still in the list and in search, and "Rebuild map" doesn't change your videos.
6. **Check it** on gremix mind: the first view shows 20 or fewer labelled bubbles with no overlapping text, and "+more" and "Other topics" open and list everything.

## Technical details

- `src/lib/knowledge-graph.ts` `buildProjectGraph` project level: sort clusters by count, show the top 20 clusters with count ≥ 2 (or fill up with count-1 clusters when there are fewer), put the rest into an overflow node. Reuse the existing `overflow` meta and inspector list, and add a search box to that list.
- `src/components/knowledge-graph.tsx`: labels only for the root, the top ~8 by weight, or the hovered node at scale < 1.2. Stronger repulsion and a larger link distance for cluster nodes. Labels cut to 22 characters.
- No data changes.
