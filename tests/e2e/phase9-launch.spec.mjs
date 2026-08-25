import { test, expect } from "@playwright/test";

const sectors = [
  { button:/Hospital/, organization:"Perth Metro Hospital Network" },
  { button:/Aged Care/, organization:"Harbourview Aged Care" },
  { button:/Disability Support/, organization:"Pathways Community Support" }
];

test("Phase 9 preserves all three fictional sector entry pathways", async ({ page }) => {
  const errors=[];
  page.on("console", message => { if(message.type()==="error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));

  for(const sector of sectors){
    await page.goto("/demo/");
    await page.getByRole("button",{name:sector.button}).click();
    await page.locator("#nameInput").fill("Phase Nine QA");
    await page.locator("#roleInput").selectOption("management");
    await page.getByRole("button",{name:"Open Guided Demo",exact:true}).click();
    await expect(page).toHaveTitle(`Home | ${sector.organization} | SkillWard`);
    await expect(page.getByText(sector.organization,{exact:true}).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("Phase 9 critical public and secure entry routes remain available", async ({ request }) => {
  for(const route of ["/","/platform/","/solutions/hospitals/","/solutions/aged-care/","/solutions/disability-support/","/security/","/contact/","/app/","/demo/"]){
    const response=await request.get(route);
    expect(response.ok(),`${route} must load`).toBe(true);
    expect(response.headers()["content-type"]).toContain("text/html");
  }
});
