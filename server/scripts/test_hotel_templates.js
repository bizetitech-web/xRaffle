(async () => {
  try {
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@local.test', password: 'Passw0rd!' })
    });

    const loginBody = await loginRes.json().catch(() => null);
    console.log('LOGIN status:', loginRes.status);
    console.log('LOGIN body:', loginBody);

    // Unauthenticated request
    const unauthRes = await fetch('http://localhost:5000/api/hotel-charge-templates');
    console.log('\nUNAUTHENTICATED GET status:', unauthRes.status);
    const unauthText = await unauthRes.text();
    console.log('UNAUTHENTICATED GET body:', unauthText);

    const token = loginBody?.token;
    if (!token) {
      console.error('No token from login, aborting authenticated checks');
      process.exit(1);
    }

    // Authenticated request
    const authRes = await fetch('http://localhost:5000/api/hotel-charge-templates?companyId=e084c7e0-2dbf-4b14-a59f-e56d044c9afa', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('\nAUTHENTICATED GET status:', authRes.status);
    const authBody = await authRes.json().catch(async () => await authRes.text());
    console.log('AUTHENTICATED GET body:', authBody);

    // Create a template (POST)
    const createRes = await fetch('http://localhost:5000/api/hotel-charge-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId: 'e084c7e0-2dbf-4b14-a59f-e56d044c9afa', chargeAmount: 5.00 })
    });
    console.log('\nCREATE POST status:', createRes.status);
    const createBody = await createRes.json().catch(async () => await createRes.text());
    console.log('CREATE POST body:', createBody);

    // Fetch again to confirm
    const authRes2 = await fetch('http://localhost:5000/api/hotel-charge-templates?companyId=e084c7e0-2dbf-4b14-a59f-e56d044c9afa', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('\nAUTHENTICATED GET #2 status:', authRes2.status);
    const authBody2 = await authRes2.json().catch(async () => await authRes2.text());
    console.log('AUTHENTICATED GET #2 body:', authBody2);

    process.exit(0);
  } catch (err) {
    console.error('Test script error:', err);
    process.exit(1);
  }
})();
