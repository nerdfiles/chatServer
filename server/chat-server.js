const WebSocket = require('ws');
var models = require('./server.js').models;


const PORT = process.env.PORT || 8080;
const ws = new WebSocket.Server({port: PORT});

console.log(`started ws on ${PORT}`)

ws.on('connection', (ws) => {
  function login(email, pass) {
    models.User.login(email, pass, (err, result) => {
      if (err) {
        ws.sendJSON.stringify({
          type: 'ERROR',
          error: err
        })
      } else {
        models.User.findOne({ where: {id : result.userId}, include: 'Profile'}, (errFindOne, user) => {
          if (errFindOne) {
            ws.sendJSON.stringify({
              type: 'ERROR',
              error: errFindOne
            })
          } else {
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
    console.log('got message', JSON.parse(message));
    let parsed = JSON.parsed(message)
    if (parsed) {
      switch(parsed.type) {
        case 'SIGNUP':
          models.User.create(parsed.data, (err, user) => {
            if (err) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                error: err
              }))
            } else {
              models.Profile.create({
                userId: user.id,
                name: parsed.data.name,
                email: parsed.data.email
              }, (profileErr, profile) => {

              })
            }
          })
        case 'LOGIN':
          login(parsed.data.email, parsed.data.password);
        default:
          console.log('Nothing to see here')
      }
    }
  });
});
