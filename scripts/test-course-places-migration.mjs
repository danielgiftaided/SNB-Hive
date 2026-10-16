import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const workflow = readFileSync('.github/workflows/deploy-payment-functions.yml', 'utf8');
const step = workflow.split('      - name: Ensure course purchase quantities are available\n')[1].split('      - name: Deploy email sender')[0];
const scripts = [...step.matchAll(/<<'NODE'\n([\s\S]*?)          NODE/g)].map(match => match[1].split('\n').map(line => line.slice(10)).join('\n'));
assert.equal(scripts.length, 2);
const directory = mkdtempSync(join(tmpdir(), 'snb-course-places-'));
const environment = { ...process.env, RUNNER_TEMP: directory };
try {
  execFileSync(process.execPath, ['--input-type=module', '-e', scripts[0]], { env: environment });
  const { query } = JSON.parse(readFileSync(join(directory, 'course-places.json'), 'utf8'));
  for (const existingColumn of [false, true]) {
    const db = new PGlite();
    await db.exec(`create table bookings(id text primary key, amount numeric, status text${existingColumn ? ', num_people integer' : ''});
      insert into bookings(id,amount,status) values('legacy',90,'paid'),('unfinished',80,'pending_payment');`);
    if (existingColumn) await db.exec("insert into bookings values('workshop',250,'paid',5)");
    const before = (await db.query('select id,amount,status from bookings order by id')).rows;
    for (let iteration = 0; iteration < 2; iteration++) {
      const result = await db.exec(query);
      writeFileSync(join(directory, 'course-places-result.json'), JSON.stringify(result.at(-1).rows));
      execFileSync(process.execPath, ['--input-type=module', '-e', scripts[1]], { env: environment });
      assert.deepEqual((await db.query('select id,amount,status from bookings order by id')).rows, before);
    }
    if (existingColumn) assert.equal((await db.query("select num_people from bookings where id='workshop'")).rows[0].num_people,5);
    await db.close();
  }
  writeFileSync(join(directory, 'course-places-result.json'), JSON.stringify([{ course_places_ready:false }]));
  assert.notEqual(spawnSync(process.execPath, ['--input-type=module', '-e', scripts[1]], { env: environment }).status, 0);
  console.log('PASS actual workflow SQL/payload/response guards, repeatable migration, existing booking amounts/statuses and workshop quantities preserved; failed schema confirmation stops deployment');
} finally { rmSync(directory, { recursive:true, force:true }); }
