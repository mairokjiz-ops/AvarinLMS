# Task Checklist: Compensatory Leave & Calendar Sync (Roster Override)

- [x] Define `COMPENSATORY` and `WORK_OFFDAY` leave types in backend API constants (`supabase/functions/api/index.ts`)
- [x] Implement monthly compensatory quota calculation `_getMonthlyCompensatoryQuota_` and sync stats in backend API
- [x] Allow Sales Supervisors & Admins to create and approve `compensatory` / `work_offday` overrides directly from the roster calendar
- [x] Implement cell-click toggling logic and confirmation modal in frontend (`index.html`)
- [x] Update frontend quota management page view to display and adjust compensatory leave adjustments
- [x] Sync constants and stats calculation in LINE webhook function (`supabase/functions/line-webhook/index.ts`)
- [x] Update LINE leave creation validation to check remaining monthly compensatory quota
- [x] Add "ลาหยุดชดเชย" (Compensatory) and "ขอทำงานในวันหยุด" (Work on Off-day) selection buttons in LINE Chatbot Flex templates
- [x] Deploy updated API and LINE webhook Edge Functions to Supabase project
- [ ] Verify functionality (toggling normal workdays to compensatory off-day, toggling weekly off-days to worked off-day, and reverting them)
- [ ] Create walkthrough of the changes
