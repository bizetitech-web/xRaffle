(async () => {
  try {
    const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'xraffle_admin@bizex.dev', password: '_Biz.4321' })
    });
    const loginBody = await loginRes.json();
    console.log('LOGIN status:', loginRes.status);
    console.log('LOGIN body:', loginBody);
    const token = loginBody.token;
    if (!token) process.exit(1);
    const permsRes = await fetch('http://localhost:5000/api/admin/permissions', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('PERMS status:', permsRes.status);
    const permsBody = await permsRes.json();
    console.log('PERMS body:', JSON.stringify(permsBody, null, 2));
  } catch (err) {
    console.error('error', err);
    process.exit(1);
  }
})();
