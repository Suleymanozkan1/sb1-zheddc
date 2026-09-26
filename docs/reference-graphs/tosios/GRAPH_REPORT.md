# Graph Report - packages  (2026-09-25)

## Corpus Check
- 119 files · ~34,642 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: .ico 2, .css 1)

## Summary
- 876 nodes · 1526 edges · 56 communities (39 shown, 17 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `98de136e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- constants.ts
- player/index.ts
- server/src/index.ts
- client/package.json
- GameState
- Map
- components/index.ts
- pixi.js
- Health.tsx
- HUD.tsx
- GameScreen
- Game
- CircleBody
- Player
- Home.tsx
- Leaderboard.tsx
- particles/index.ts
- ref_tosios_common
- Monster
- Player
- game/Game.ts
- RectangleBody
- Game
- game/entities/Monster.ts
- BaseEntity
- Bullet
- Vector2
- maths.ts
- Messages.tsx
- models/index.ts
- NewGameField.tsx
- react
- game/entities/Player.ts
- sounds/index.ts
- sprites/index.ts
- collisions/utils.ts
- GameState.ts
- RectangleSprite
- manifest.json
- TextSprite
- CircleSprite
- icons/index.ts
- PlayerLivesSprite.ts
- tiled.ts
- Inputs
- common/package.json
- keys.ts
- View
- collisions.ts
- NewGameField
- PlayerLivesSprite
- BulletsManager
- src/images/index.ts
- JoySticks
- Rectangle
- declare.d.ts

## God Nodes (most connected - your core abstractions)
1. `GameState` - 39 edges
2. `Game` - 36 edges
3. `react` - 34 edges
4. `Player` - 31 edges
5. `Player` - 31 edges
6. `GameScreen()` - 25 edges
7. `pixi.js` - 22 edges
8. `Monster` - 21 edges
9. `RectangleBody` - 19 edges
10. `CircleBody` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Game` --references--> `Player`  [EXTRACTED]
  halftheopposite-tosios/packages/client/src/game/Game.ts → halftheopposite-tosios/packages/client/src/game/entities/Player.ts
- `Game` --references--> `BulletsManager`  [EXTRACTED]
  halftheopposite-tosios/packages/client/src/game/Game.ts → halftheopposite-tosios/packages/client/src/game/managers/BulletsManager.ts
- `Game` --references--> `MonstersManager`  [EXTRACTED]
  halftheopposite-tosios/packages/client/src/game/Game.ts → halftheopposite-tosios/packages/client/src/game/managers/MonstersManager.ts
- `Game` --references--> `PlayersManager`  [EXTRACTED]
  halftheopposite-tosios/packages/client/src/game/Game.ts → halftheopposite-tosios/packages/client/src/game/managers/PlayersManager.ts
- `Game` --references--> `PropsManager`  [EXTRACTED]
  halftheopposite-tosios/packages/client/src/game/Game.ts → halftheopposite-tosios/packages/client/src/game/managers/PropsManager.ts

## Import Cycles
- 3-file cycle: `halftheopposite-tosios/packages/common/src/index.ts -> halftheopposite-tosios/packages/common/src/models/index.ts -> halftheopposite-tosios/packages/common/src/models/Player.ts -> halftheopposite-tosios/packages/common/src/index.ts`
- 3-file cycle: `halftheopposite-tosios/packages/common/src/entities/index.ts -> halftheopposite-tosios/packages/common/src/entities/map.ts -> halftheopposite-tosios/packages/common/src/index.ts -> halftheopposite-tosios/packages/common/src/entities/index.ts`

## Communities (56 total, 17 thin omitted)

### Community 0 - "constants.ts"
Cohesion: 0.04
Nodes (44): APP_TITLE, BACKGROUND_COLOR, BULLET_RATE, BULLET_SIZE, BULLET_SPEED, DEBUG, FLASK_SIZE, FLASKS_COUNT (+36 more)

### Community 1 - "player/index.ts"
Cohesion: 0.05
Nodes (37): client_src_game_assets_images_gui_crosshair, client_src_game_assets_images_gui_heart_empty, client_src_game_assets_images_gui_heart_full, heartEmptyTexture, heartFullTexture, client_src_game_assets_images_monsters_bat_1, client_src_game_assets_images_monsters_bat_2, client_src_game_assets_images_monsters_bat_3 (+29 more)

### Community 2 - "server/src/index.ts"
Cohesion: 0.07
Nodes (26): colyseus, @colyseus/monitor, compression, cors, express, ref_http, path, dependencies (+18 more)

### Community 3 - "client/package.json"
Cohesion: 0.06
Nodes (26): browserslist, dependencies, colyseus.js, howler, pixi.js, pixi-particles, pixi-viewport, querystringify (+18 more)

### Community 5 - "Map"
Cohesion: 0.11
Nodes (15): common_src_maps_gigantic, List, common_src_maps_small, common_src_tiled_index_tmx, Map, ILayer, IMap, ITile (+7 more)

### Community 6 - "components/index.ts"
Cohesion: 0.11
Nodes (20): Box, Button, BUTTON_HOVERED, BUTTON_REVERSED, client_src_components_index_button, client_src_components_index_keyboardkey, Inline(), SizeNames (+12 more)

### Community 7 - "pixi.js"
Cohesion: 0.13
Nodes (9): BaseProps, client_src_game_entities_index_bullet, client_src_game_entities_index_player, BaseManager, client_src_game_managers_index_basemanager, MonstersManager, PlayersManager, PropsManager (+1 more)

### Community 8 - "Health.tsx"
Cohesion: 0.15
Nodes (18): client_src_components_index_text, client_src_icons_index_menu, client_src_images_index_heartemptyimage, client_src_images_index_heartfullimage, styles, Container(), Health, styles (+10 more)

### Community 9 - "HUD.tsx"
Cohesion: 0.10
Nodes (20): client_src_components_index_view, Announce, HUD, HUDProps, styles, client_src_screens_game_components_hud_index_health, client_src_screens_game_components_hud_index_hudprops, client_src_screens_game_components_hud_index_leaderboard (+12 more)

### Community 10 - "GameScreen"
Cohesion: 0.13
Nodes (15): GameScreen(), handleActionSend(), handleMessage(), handleMonsterAdd(), handleMonsterUpdate(), handlePlayerAdd(), handlePlayerRemove(), handlePlayerUpdate() (+7 more)

### Community 12 - "CircleBody"
Cohesion: 0.13
Nodes (7): common_src_collisions_index_treecollider, CircleBody, common_src_index_maths, BulletJSON, movePlayer(), PlayerJSON, Teams

### Community 14 - "Home.tsx"
Cohesion: 0.14
Nodes (14): client_src_components_index_box, client_src_components_index_room, client_src_components_index_separator, client_src_components_index_space, SizeNames, SIZES, Space(), client_src_images_index_titleimage (+6 more)

### Community 15 - "Leaderboard.tsx"
Cohesion: 0.13
Nodes (11): client_src_components_index_roomfielditem, client_src_components_index_table, client_src_components_index_tablecell, client_src_components_index_tableheader, client_src_components_index_tablerow, styles, Table(), TableCell() (+3 more)

### Community 16 - "particles/index.ts"
Cohesion: 0.13
Nodes (16): client_src_game_assets_images_index_weapontextures, client_src_game_assets_particles_bubble, client_src_game_assets_particles_impact, BubbleTexture, ImpactTexture, Trail100Texture, Trail25Texture, Trail50Texture (+8 more)

### Community 17 - "ref_tosios_common"
Cohesion: 0.24
Nodes (8): @colyseus/schema, ref_tosios_common, Circle, type, server_src_entities_index_circle, MonsterState, Prop, type

### Community 18 - "Monster"
Cohesion: 0.18
Nodes (4): getClosestPlayerId(), getPlayerFromId(), Monster, type

### Community 19 - "Player"
Cohesion: 0.13
Nodes (4): getTeamColor(), Player, type, validateName()

### Community 20 - "game/Game.ts"
Cohesion: 0.14
Nodes (13): client_src_game_assets_images_maps_dungeon, SpriteSheets, client_src_game_assets_particles_index_impactconfig, client_src_game_entities_index_monster, client_src_game_entities_index_prop, TODO: These two constants should be calculated automatically., Stats, ZINDEXES (+5 more)

### Community 22 - "Game"
Cohesion: 0.24
Nodes (7): countActivePlayers(), countPlayers(), Game, getWinningPlayer(), getWinningTeam(), IGame, type

### Community 23 - "game/entities/Monster.ts"
Cohesion: 0.14
Nodes (6): client_src_game_assets_images_index_monsterstextures, getDirection(), Monster, MonsterDirection, ZINDEXES, client_src_game_sprites_index_effects

### Community 24 - "BaseEntity"
Cohesion: 0.15
Nodes (6): client_src_game_assets_images_index_proptextures, BaseEntity, client_src_game_entities_index_baseentity, getTexture(), Prop, ZINDEXES

### Community 28 - "Messages.tsx"
Cohesion: 0.19
Nodes (10): client_src_components_index_inline, Text, client_src_icons_index_githubicon, getFormattedMessage(), Message(), Messages, styles, Footer() (+2 more)

### Community 29 - "models/index.ts"
Cohesion: 0.17
Nodes (7): ActionJSON, ActionType, MessageJSON, MessageType, MonsterJSON, PropJSON, PropType

### Community 30 - "NewGameField.tsx"
Cohesion: 0.20
Nodes (9): client_src_components_index_input, client_src_components_index_listitem, client_src_components_index_select, ListItem, Select, GameModesList, MapsList, NewGameFieldProps (+1 more)

### Community 31 - "react"
Cohesion: 0.22
Nodes (7): HORIZONTAL, Separator, VERTICAL, client_src_hooks_index_usehover, useHover(), styles, react

### Community 32 - "game/entities/Player.ts"
Cohesion: 0.18
Nodes (9): client_src_game_assets_images_index_playertextures, client_src_game_assets_particles_index_smokeconfig, SmokeTexture, getDirection(), PlayerDirection, FIXME: Tints seem not to be apliable directly on a AnimatedSprite., ZINDEXES, client_src_game_sprites_index_playerlivessprite (+1 more)

### Community 33 - "sounds/index.ts"
Cohesion: 0.18
Nodes (10): client_src_game_assets_sounds_explosion, client_src_game_assets_sounds_fire, client_src_game_assets_sounds_footstep, explosion, ExplosionSound, fire, FireSound, footstep (+2 more)

### Community 35 - "collisions/utils.ts"
Cohesion: 0.31
Nodes (9): circleToCircle(), circleToRectangle(), circleToRectangles(), circleToRectangleSide(), correctedPositionFromSide(), rectangleToRectangle(), rectangleToRectangles(), rectangleToRectangleSide() (+1 more)

### Community 36 - "GameState.ts"
Cohesion: 0.18
Nodes (7): Bullet, type, server_src_entities_index_bullet, server_src_entities_index_game, server_src_entities_index_monster, server_src_entities_index_player, server_src_entities_index_prop

### Community 38 - "manifest.json"
Cohesion: 0.22
Nodes (8): background_color, display, icons, name, orientation, short_name, start_url, theme_color

### Community 41 - "icons/index.ts"
Cohesion: 0.22
Nodes (8): client_src_icons_account_multiple, client_src_icons_arrow_left, client_src_icons_github, client_src_icons_lock, client_src_icons_lock_open, client_src_icons_magic_wand, client_src_icons_menu, client_src_icons_refresh

### Community 42 - "PlayerLivesSprite.ts"
Cohesion: 0.25
Nodes (3): client_src_game_assets_images_index_guitextures, AnchorContainer, client_src_game_sprites_index_anchorcontainer

### Community 43 - "tiled.ts"
Cohesion: 0.29
Nodes (5): client_src_game_sprites_index_rectanglesprite, getSpritesLayer(), getTexturesSet(), ITextureSets, SPECIAL_LAYERS

### Community 45 - "common/package.json"
Cohesion: 0.25
Nodes (7): dependencies, rbush, main, name, private, version, rbush

### Community 46 - "keys.ts"
Cohesion: 0.25
Nodes (7): DOWN, LEADERBOARD, LEFT, MENU, RIGHT, SHOOT, UP

### Community 47 - "View"
Cohesion: 0.29
Nodes (6): BACKDROP, CENTER_FLEX, COLUMN_FLEX, FLEX, FULLSCREEN, View

### Community 48 - "collisions.ts"
Cohesion: 0.43
Nodes (4): common_src_collisions_index_circletorectangleside, common_src_collisions_index_rectangletorectangleside, COLLISION_TYPES, CollisionType

### Community 49 - "NewGameField"
Cohesion: 0.33
Nodes (3): handleSave(), NewGameField(), handleCreate()

### Community 52 - "src/images/index.ts"
Cohesion: 0.40
Nodes (4): client_src_images_heart_empty, client_src_images_heart_full, client_src_images_player, client_src_images_title

## Knowledge Gaps
- **180 isolated node(s):** `name`, `version`, `private`, `main`, `@reach/router` (+175 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 478 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `client/package.json`, `components/index.ts`, `Health.tsx`, `HUD.tsx`, `Home.tsx`, `Leaderboard.tsx`, `View`, `Messages.tsx`, `NewGameField.tsx`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `pixi.js` connect `pixi.js` to `game/entities/Player.ts`, `player/index.ts`, `sprites/index.ts`, `client/package.json`, `TextSprite`, `PlayerLivesSprite.ts`, `tiled.ts`, `particles/index.ts`, `game/Game.ts`, `game/entities/Monster.ts`, `BaseEntity`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `Game` connect `Game` to `pixi.js`, `HUD.tsx`, `GameScreen`, `tiled.ts`, `Inputs`, `Player`, `BulletsManager`, `game/Game.ts`, `game/entities/Monster.ts`, `BaseEntity`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _180 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `constants.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `player/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0507399577167019 - nodes in this community are weakly interconnected._
- **Should `server/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07308377896613191 - nodes in this community are weakly interconnected._