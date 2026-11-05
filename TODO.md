- Across the map and this project (and source) create a runbook.

- Have collections of pages that appear in different collections eg :

Hat Man
Appears in 'Architypal figures' list page - which has a note about "these (perhaps Omnipresent) beings...' Genny Greenteeth

Hat man can appear in a general index of 'creatures' as well.

Charles Fort's "Amazing abilities?"


Story data

- Tsuwatelda (Brevard, North Carolina): #coordinates points at the other Pilot Mountain, in Surry County. #proposed-coordinates (35.265, -82.837) is the right one. Fix in asheville-data-targets, then re-import.

- Check the nearest-town guesses for the Asheville stories: Devil's Courthouse and Tanasee Bald (Balsam Grove), Fryingpan Mountain lookout (Cruso), The Boojum (Waynesville), Rich Mountain meteorite (Cullowhee), Brown Mountain Lights (Morganton), Derek Lueking disappearance (Cherokee), Elisha Mitchell's summit grave (Burnsville), Jocassee valley (Salem, SC), Lake James giant catfish (Nebo).

- Decide whether Cataloochee (a valley), Lost Cove and Sunburst (vanished communities) should stay as places.

- Delete local-llm-agent/asheville-data-targets-original once happy with the renamed Asheville files.

- Screaming skulls that look like repeats of existing stories. Tag one of each pair `duplicate` in the source files, or the next import loses it: Bettiscombe skull / The Screaming Skull of Bettiscombe Manor; Anne Griffith's skull / The Screaming Skull of Burton Agnes Hall; Wardley Hall skull / The Screaming Skull of Wardley Hall; Dafydd's skull / The Vengeance of the Skull.

- Bran's head: `London, London, England.md` gives a new `london` region beside `greater-london` and `city-of-london`. Rename the source file to Greater London.

- O'Lafferty's skull (Derby) is tagged `check` but is published. Check it.

- "The Lady in White" (road-ghost) has no #summary.

- Three `... copy.md` files in curse-data-targets/UK are skipped on purpose: Dunbartonshire, Bristol, Dumfriesshire. Delete them if they aren't needed.


CPU

- Finish measuring what each piece costs, on the current code: chameleon, dust canvas, flyer, and the mix-blend-mode layers. The chameleon, painting and compositing haven't been measured yet.

- nudgeTriangleDrawing (flyer) and touch in js/orchestrator.js (chameleon) measure every triangle picture each frame. Use a cached box per picture, as the quill titles do. nudgeTriangleDrawing also sends pointermove every frame, even when the flyer hasn't moved or is resting, and each one makes startRepel measure the picture again.

- startRepel still does its vertex maths every frame while a pointer is on a picture, without drawing. It was kept in case an animation moves the triangles under a resting pointer; it could stop when nothing is moving if that is handled.

- Quill title boxes re-measure when the page or title changes size. Anything that moved a title without changing either would leave its box out of date until the next resize. Nothing on the site does this now.

- Triangle pictures don't always return to exactly their original pixels after a push (differences up to 4 out of 255, too small to see). The same happens without the draw change. Cause unknown.
