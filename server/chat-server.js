const WebSocket = require('ws');
var models = require('./server.js').models;


const PORT = process.env.PORT || 8080;
const ws = new WebSocket.Server({port: PORT});

const clients = [];

console.log(`started ws on ${PORT}`)

ws.on('connection', (ws) => {

  function login(email, pass) {
    models.User.login({
      email: email,
      password: pass
    }, (err, result) => {
      if (err) {
        console.log('logging in failed')
        ws.send(JSON.stringify({
          type: 'ERROR',
          error: err
        }));
      } else {
        models.User.findOne({ where: {id : result.userId}, include: 'Profile'}, (errFindOne, user) => {
          if (errFindOne) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              error: errFindOne
            }));
          } else {

            const userObject = {
              id: user.id,
              email: user.email,
              ws: ws
            };

            clients.push(userObject);

            console.log('current clients', clients)


            ws.send(JSON.stringify({
              type: 'LOGGEDIN',
              data: {
                session: result,
                user: user
              }
            }));
          }
        })
      }
    })
  }

  ws.on('message', message => {

    let parsed = JSON.parse(message)

    if (parsed) {

      console.log('parsed successfully', parsed)

      switch (parsed.type) {

        case 'SIGNUP':
          console.log('SIGNUP');
          console.log(parsed.data)
          models.User.create(parsed.data, (err, user) => {

            if (err) {
              console.log('User not created', err)

              ws.send(JSON.stringify({
                type: 'ERROR',
                error: err
              }));

            } else {
              console.log('User created', user);

              models.Profile.create({
                userId: user.id,
                name: parsed.data.name,
                email: parsed.data.email
              }, (profileErr, profile) => {

                if (!profileErr) {
                  console.log('Profile created', profile)
                  login(parsed.data.email, parsed.data.password)
                } else {
                  console.log('Profile not created', profileErr)
                }

              });
            }
          });
          break;

        case 'LOGIN':
          console.log('loggin in', parsed.data)
          login(parsed.data.email, parsed.data.password);
          break;

        case 'SEARCH':
          console.log('Searching for', parsed.data);
          models.User.find({where: {email: {like: parsed.data}}}, (errSearch, users) => {
            if (!errSearch && users) {
              ws.send(JSON.stringify({
                type: 'GOT_USERS',
                data: {
                  users: users
                }
              }));
            }
          });
          break;

        default:
          console.log('Nothing to see here');
      }
    }
  });
});

