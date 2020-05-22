const WebSocket = require('ws');
var models = require('./server.js').models;


const PORT = process.env.PORT || 8080;
const ws = new WebSocket.Server({port: PORT});

const clients = [];

console.log(`started ws on ${PORT}`)

const printClientCount = () => {
  console.log('Clients', clients.length)
}

//setInterval(printClientCount, 1000)

ws.on('connection', (ws) => {

  const getInitialThreads = async function(userId) {

    models.Thread.find({where: { }, include: 'Messages'}, (err, threads) => {

      if (!err && threads) {

        threads.map((thread, i) => {
          models.User.find({
            where: {id: {inq: thread.users}}
          }, (errUser, users) => {
            thread.profiles = users;
            console.log(threads)

            if (i === threads.length - 1) {
              ws.send(JSON.stringify({
                type: 'INITIAL_THREADS',
                data: threads
              }))
            }
          })
        })
      }
    })

  };

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

            ws.uid = user.id + new Date().getTime().toString()
            const userObject = {
              id: user.id,
              email: user.email,
              ws: ws
            };

            clients.push(userObject);

            //console.log('current clients', clients)

            getInitialThreads(user.id)

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

  ws.on('close', req => {
    console.log('req close', req)
    let clientIndex = -1
    clients
      .map((c, i) => {
        if (c.ws._closeCode === req) {
          clientIndex = i
        }
      });

    if (clientIndex > -1) {
      clients.splice(clientIndex, 1)
    }
  });

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

        case 'CONNECT_WITH_TOKEN':
          models.User.findById(parsed.data.userId, (err2, user) => {

            ws.uid = user.id + new Date().getTime().toString()
            const userObject = {
              id: user.id,
              email: user.email,
              ws: ws
            };

            clients.push(userObject);

            //console.log('current clients', clients)

            getInitialThreads(user.id)

            /*
            ws.send(JSON.stringify({
              type: 'LOGGEDIN',
              data: {
                session: result,
                user: user
              }
            }));
            */
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

        case 'FIND_THREAD':
          console.log(parsed.data)
          models.Thread.findOne({
            where: {
              and: [
                {users: { like: parsed.data[0]}},
                {users: { like: parsed.data[1]}}
              ]
            }
          }, (err, thread) => {
            // console.log('---------')
            // console.log('found thread', thread)
            // console.log('err', err)
            // console.log('---------')
            if (thread) {
              console.log('FIND_THREAD found')
              ws.send(JSON.stringify({
                type: 'ADD_THREAD',
                data: thread
              }));
            } else {
              models.Thread.create({
                lastUpdated: new Date(),
                users: parsed.data,
              }, (errThread, thread) => {
                if (!errThread && thread) {
                  console.log('ADD_THREAD created')
                  console.log(clients)
                  clients.filter(u => thread.users.indexOf(u.id.toString()) > -1).map(client => {
                    console.log(client)
                    client.ws.send(JSON.stringify({
                      type: 'ADD_THREAD',
                      data: thread
                    }));
                  })
                }
              })
            }
          });

          break;

        case 'THREAD_LOAD':
          console.log('THREAD_LOAD')
          models.Message.find({
            where: {
              threadId: parsed.data.threadId,
            },
            order: 'date DESC',
            skip: parsed.data.skip,
            limit: 10
          }, (errMessage, messages) => {
            console.log(message)
            if (!errMessage && messages) {
              ws.send(JSON.stringify({
                type: 'GOT_MESSAGES',
                threadId: parsed.data.threadId,
                messages: messages
              }));
            }
          })
          break;

        case 'ADD_MESSAGE':
          models.Thread.findById(parsed.threadId, (errAddMessage, thread) => {
            if (!errAddMessage && thread) {
              models.Message.upsert(parsed.message, (errInsert, message) => {
                clients
                  .filter(client => thread.users.indexOf(client.id.toString()) > -1)
                  .map(client => {
                    client.ws.send(JSON.stringify({
                      type: 'ADD_MESSAGE_TO_THREAD',
                      threadId: parsed.threadId,
                      message: message
                    }));
                  });
              });
            }
          });
          break;

        default:
          console.log('Nothing to see here');
      }
    }
  });
});

