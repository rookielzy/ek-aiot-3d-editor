# 10: åœ?Vue å®Œæˆè¿žæŽ¥ã€æŸ¥è¯¢ä¸Žæ˜ å°„é…ç½®æµç¨‹

Status: review

Parent: [HTTP æ•°æ®æºç®¡ç†é¦–æœŸå®žçŽ°è§„æ ¼](../spec.md)

Phase: é˜¶æ®µå›?

Blocked by: 09

User stories: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 27, 29, 30, 31

Decisions: D01, D04, D05, D06, D07, D12, D13

å½“å‰åªæŽˆæƒè§„æ ¼ä¸Žä»»åŠ¡æ•´ç†ï¼›æœ¬ä»»åŠ¡å°šæœªå¯åŠ¨ã€‚å®žæ–½æ—¶å¿…é¡»å…ˆå®Œæˆ?Blocked by ä¸­çš„ä»»åŠ¡ã€?

## What to build

Vue ä½¿ç”¨è€…å¯åœ¨åŽŸç”?Workbench å®Œæˆä¸?React ç­‰ä»·çš„æ•°æ®æºæŽ¥å…¥ã€æµ‹è¯•ã€æ˜ å°„é¢„è§ˆå’Œé…ç½®ç»´æŠ¤ã€?

## Responsibilities

| èŒƒå›´ | æœ¬ä»»åŠ¡èŒè´?|
| --- | --- |
| core | å¤ç”¨å·²å®Œæˆçš„å…¨éƒ¨ contract/model/commandï¼›ä»…ä¿®å¤ç¡®æœ‰è¯æ®çš„æ¡†æž¶æ— å…³èƒ½åŠ›ç¼ºå£ï¼Œä¸æ–°å¢?Vue ç‰¹ä¾›è¯­ä¹‰ã€?|
| React | ä½œä¸ºå·²éªŒè¯äº¤äº’å‚ç…§ï¼›è‹¥å‘çŽ°å…±äº«è¯­ä¹‰é—®é¢˜ï¼Œéš?core ä¿®å¤åŒæ­¥éªŒè¯ï¼Œä¸é€šè¿‡ Vue åŽ»ä¾èµ?React ç»„ä»¶ã€?|
| Vue | æ–°å¢žæ•°æ®å¯¼èˆªã€å®½é…ç½®çª—å£ã€è¿žæŽ?è¯·æ±‚/æ˜ å°„è¡¨å•ã€è‰ç¨?å“åº”ä¼šè¯ã€é—®é¢˜å®šä½ã€å®¿ä¸»èƒ½åŠ›ä¼ é€’å’Œ composable è®¢é˜…ï¼›æä¾?en/zh-CN ä¸?scoped-slot ä¸Šä¸‹æ–‡ã€?|

## Acceptance criteria

- [ ] Vue å¤šè¿žæŽ?æŸ¥è¯¢ã€å­—æ®?é»˜è®¤å€¼ã€GET/åªè¯» POSTã€ç¤ºä¾‹æ•°æ®ä¸Žä¿å­˜äº‹åŠ¡å’?React ä¸€è‡´ã€?
- [ ] æ ¸å¿ƒæ‰§è¡Œã€æ˜ å°„ã€é”™è¯¯åˆ¤å®šä¸Žè½®è¯¢æœªå¤åˆ¶åˆ° composable æˆ–ç»„ä»¶ï¼›åªè°ƒç”¨å…¬å¼€ core APIã€?
- [ ] æµ‹è¯•å‚æ•°éš”ç¦»ã€æ˜ å°„å³æ—¶åé¦ˆã€å–æ¶?å…³é—­è‰ç¨¿ä¸Žç¦»çº¿ä¿å­˜è¡Œä¸ºä¸€è‡´ï¼›åŒæºçœŸå®ž HTTP å¯ç”¨ã€?
- [ ] editor ref æ›´æ¢å…ˆé‡Šæ”¾æ—§è®¢é˜…/æµ‹è¯•å¥æŸ„ï¼Œæ–° editor ä¸ç»§æ‰¿æ—§å“åº”æˆ–è‰ç¨¿ï¼›å¤–éƒ¨ editor ä¸è¢«å¸è½½è¯¯é”€æ¯ã€?
- [ ] è¯­è¨€/é¢æ¿åˆ‡æ¢ä¸é‡å»?editor/runtimeï¼Œç„¦ç‚¹å¯è§ï¼Œè¾“å…¥å¿«æ·é”®ä¸è¢«å…¨å±€ç¼–è¾‘æ“ä½œåŠ«æŒã€?
- [ ] å…¬å¼€ Vue ç±»åž‹ã€slotsã€æ—§ props ä¸ŽçŽ°æœ‰å®¿ä¸»ä»å¯ç”¨ï¼›ä¸è¦æ±‚å®¿ä¸»é…ç½®æ ·å¼ç”Ÿæˆã€?

## Testing

Vue useEditor/useWorkbenchã€Workbench DOM/åŒè¯­/è‰ç¨¿ä¸?editor æ›¿æ¢ï¼›package-root consumerï¼›åŒæº?HTTP æµè§ˆå™¨é…ç½?smokeï¼Œå¹¶å¤ç”¨ core å¤¹å…·è€Œéžå¤åˆ¶ç®—æ³•æµ‹è¯•ã€?

åªæ–­è¨€å…¬å¼€è¡Œä¸ºã€ç”¨æˆ·å¯è§ç»“æžœä¸Žå¤–éƒ¨å‰¯ä½œç”¨ï¼›æ¯é¡¹å¤±è´¥å…ˆå®šä½ä¸Žå½“å‰åˆ‡ç‰‡çš„å…³ç³»ï¼Œä¸åœ¨ adapter é‡å¤ core ç®—æ³•æµ‹è¯•ã€‚éªŒè¯å®ŒæˆåŽæŠŠå®žé™…å‘½ä»¤å’Œç»“æžœå†™å…¥ Commentsã€?

## Context and boundaries

å…ˆå®Œæ•´é˜…è¯?Parentã€‚æœ¬ä»»åŠ¡ä»?core å…¬å…±å¥‘çº¦ä¸ŽåŽŸåž‹æµç¨‹ä¸ºä¾æ®ï¼ŒåŽŸåž‹ä»£ç ä¸ç›´æŽ¥è¿›å…¥æ­£å¼åŒ…ã€‚å§‹ç»ˆåŒºåˆ?durable é…ç½®ä¸Žè¿è¡Œæ€ï¼Œéµå®ˆ NodeIdã€command/history å’Œæ¡†æž¶è–„é€‚é…å±‚è¾¹ç•Œã€?

æœ¬ä»»åŠ¡ä¸å®žçŽ° Vue å¯¹è±¡è¯¦æƒ…/é¢œè‰² UIï¼Œç•™ç»?11ï¼›ä¸é‡æ–°è®¾è®¡å·²ç¡®è®¤çš„äº¤äº’æµç¨‹ã€?

## Comments

2026-10-26ï¼šæŒ‰ç”¨æˆ·è®¤å¯çš„åŽŸåž‹æµç¨‹æ•´ç†ä¸ºæ­£å¼è§„åˆ’ä»»åŠ¡ã€‚Status è¡¨ç¤ºå®šä¹‰å°±ç»ªï¼Œä¸ä»£è¡¨å®žçŽ°ã€éªŒè¯æˆ–ç”¨æˆ·å·²æŽˆæƒå¼€å§‹æ‰§è¡Œã€?
2026-11-02£ºVue ÊÊÅäÆ÷ÒÑÊµÏÖÁ¬½Ó¡¢²éÑ¯ÓëÓ³ÉäÅäÖÃÁ÷³Ì²¢Íê³ÉÑéÖ¤¡£

ÊµÏÖ·¶Î§£º
- packages/vue/src/components/DataSourcesPanel.vue£ºÊý¾ÝÊÓÍ¼£¨ËÑË÷¡¢Á¬½ÓÔöÉ¾¸Ä²é/¸´ÖÆ/²âÊÔ¡¢²éÑ¯ÁÐ±í¡¢×´Ì¬·´À¡¡¢Ôà²Ý¸å±£»¤¡¢ÎÊÌâ¶¨Î»Èë¿Ú£©£¬½öµ÷ÓÃ core µÄ uildDataSourcesWorkspaceModel/ilterDataConnectionItems/uildSave|Delete|DuplicateDataConnectionCommand/uildSave|Delete|DuplicateDataQueryCommand¡£
- packages/vue/src/components/DataConnectionForm.vue¡¢DataQueryEditor.vue¡¢DataQueryTester.vue ¼° DataQueryParameterRow.vue/DataQueryPropertyRow.vue/DataQueryPathField.vue/DataQueryMappingPreview.vue/DataParameterValueInput.vue¡¢data-query-ui.ts£ºÇëÇó²Ý¸å¡¢²ÎÊý¡¢Ó³Éä¡¢Ê¾Àý JSON Ô¤ÀÀÓëÊÖ¶¯²âÊÔ£»Ö´ÐÐ¡¢Ó³Éä¡¢´íÎóÓëÂÖÑ¯È«²¿¾­ core ¹«¹² API£¨uildDataQueryRequest¡¢alidateDataQueryMapping¡¢mapDataQueryBody¡¢alidateDataQueryDefinition¡¢EditorDataService£©£¬Î´ÔÚ×éºÏÊ½º¯Êý»ò×é¼þÖÐ¸´ÖÆ core Âß¼­¡£
- packages/vue/src/composables/use-workbench.ts£ºÐÂÔö dataServiceState ¶©ÔÄ£¬±à¼­Æ÷ÒýÓÃÌæ»»Ê±ÊÍ·Å¾É¶©ÔÄ£»EditorWorkbench ÐÂÔö credentials prop ²¢Í¸´« core ±à¼­Æ÷Ñ¡Ïî¡£
- EditorWorkbench.vue/WorkbenchLeftPanel.vue/WorkbenchStatusBar.vue/WorkbenchProblemsDrawer.vue/WorkbenchIcon.vue£ºÐÂÔöÊý¾Ýµ¼º½ÊÓÍ¼¡¢Locate ÎÊÌâ¶¨Î»¡¢data Í¼±ê£»packages/vue/src/components/workbench-problem-target.ts Ìá¹©Êý¾ÝÎÊÌâÄ¿±êÀàÐÍÊØÎÀ¡£
- packages/vue/src/components/workbench.css£ºÐÂÔöÊý¾ÝÃæ°å¡¢Á¬½Ó±íµ¥¡¢²éÑ¯±à¼­Æ÷¡¢²âÊÔÆ÷ÓëÓ³ÉäÔ¤ÀÀÑùÊ½£¨ÎÞÐèËÞÖ÷Éú³É CSS£©¡£
- ²âÊÔ£ºÐÂÔö packages/vue/test/workbench-data-sources.test.ts£¨¿Õ¹¤×÷Çø¡¢ÔöÉ¾¸Ä¸´ÖÆ³·Ïú¡¢·Ç·¨²Ý¸å¡¢ËÞÖ÷Æ¾¾Ý¡¢ºÁÃë³¬Ê±Íù·µ¡¢¹«¹²ÇëÇóÍ·/±£ÁôÍ·¡¢²Ý¸å·ÅÆúÈ·ÈÏ¡¢ÀëÏß±£´æ¡¢ËÑË÷Óë²Ý¸å¿çÊÓÍ¼/ÓïÑÔ±£³Ö£©¡£

¼Ü¹¹¾ö²ß£¨Ðè¼ÇÂ¼£©£ºÎªÂú×ã¡°Í¬Ò»×Ö¶Î/Ä¬ÈÏÖµ/´íÎóÓëÎÄ°¸¡±ºÍ¡°ÊÊÅäÆ÷²»µÃ¸´ÖÆÓ³ÉäÓë´íÎóÂß¼­¡±£¬°Ñ¿ò¼ÜÎÞ¹ØµÄ²éÑ¯±íµ¥Ä£ÐÍ£¨query-form.ts¡¢query-parameter-form.ts£©ÓëÊý¾ÝÎÊÌâÎÄ°¸¼üÓ³Éä£¨problem-message-keys.ts£©´Ó React °üÇ¨Èë core£¬React Óë Vue ¾ù¸ÄÎªÏû·Ñ core ¹«¹² API£»packages/core/src/public-api.test.ts ¸²¸ÇÐÂµ¼³ö£¬.changeset/vue-data-source-configuration.md ¼ÇÂ¼¸Ã±ä¸ü¡£

ÑéÖ¤£º
- cd packages/vue; npx vue-tsc --noEmit£ºÍ¨¹ý¡£
- 
px tsc -p packages/core/tsconfig.json£ºÍ¨¹ý¡£
- 
px tsc -p packages/react/tsconfig.json£ºÍ¨¹ý¡£
- 
px vitest run packages/vue£º12 ¸öÎÄ¼þ / 139 ¸öÓÃÀýÍ¨¹ý¡£
- 
px vitest run packages/vue/test/workbench-data-sources.test.ts£º10 ¸öÓÃÀýÍ¨¹ý¡£
- 
px vitest run£¨È«Á¿£©£º146 ¸öÎÄ¼þÍ¨¹ý£¬2 ¸ö React ÎÄ¼þ£¨workbench-data-colors¡¢workbench-http-contract£©ÔÚ²¢ÐÐÂúÔØÏÂ³¬¹ý 10s ³¬Ê±£»µ¥¶ÀÖØÅÜ¸ÃÁ½ÎÄ¼þ 6 ¸öÓÃÀýÈ«²¿Í¨¹ý¡£

Î´ÄÉÈë±¾ÈÎÎñ£¨ÊôÓÚ 11£©£ºVue ¶ÔÏóÏêÇé/ÑÕÉ«/°ó¶¨ UI£»²éÑ¯Óë¶ÔÏóµÄ°ó¶¨¶Ô»°¿òÈÔÖ»ÔÚ React ²àÌá¹©¡£ä¯ÀÀÆ÷¶ËÍ¬Ô´ÕæÊµ HTTP Ã°ÑÌÓÃÀýÉÐÎ´²¹Æë£¬ÏÂÒ»ÂÖ²¹ *.browser.test.ts¡£