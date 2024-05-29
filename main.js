require("dotenv").config();
const SpotifyWebApi = require('spotify-web-api-node');
const { input } = require("@inquirer/prompts");
const nodemailer = require("nodemailer");

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  EMAIL_USER,
  EMAIL_PASS,
  TARGET_EMAIL_USER
} = process.env;

const transporter = nodemailer.createTransport({
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

const redirectUri = "http://localhost:3000/callback";
const spotifyApi = new SpotifyWebApi({
    clientId: SPOTIFY_CLIENT_ID,
    clientSecret: SPOTIFY_CLIENT_SECRET,
    redirectUri,
});

const authorize = () => {
    console.log("Creating authorization URL...\n");
    const scopes = ["user-read-currently-playing"];
    const state = "some-state-of-my-choice";

    // Create the authorization URL
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);

    console.log("Please go to:  ", authorizeURL);
    console.log("\nCopy code query param from response in browser...\n");
}

// token valid for 1 hour
const codeGrant = (code) => {
    let resolve;
    let reject;
    const codeGrantPromise = new Promise(res => {resolve = res}, rej => {reject = rej});
    spotifyApi.authorizationCodeGrant(code).then(
        function(data) {
          console.log('The token expires in ' + data.body['expires_in']);
          console.log('The access token is ' + data.body['access_token']);
          console.log('The refresh token is ' + data.body['refresh_token']);
      
          // Set the access token on the API object to use it in later calls
          spotifyApi.setAccessToken(data.body['access_token']);
          spotifyApi.setRefreshToken(data.body['refresh_token']);

          resolve();
        },
        function(err) {
          console.log('Something went wrong!', err);
          reject();
        }
    );
    return codeGrantPromise;
}

const refreshToken = () => {
    spotifyApi.refreshAccessToken().then(
        function(data) {
          console.log('The access token has been refreshed!');
      
          // Save the access token so that it's used in future calls
          spotifyApi.setAccessToken(data.body['access_token']);
        },
        function(err) {
          console.log('Could not refresh access token', err);
        }
      );
};

const getCurrentTrack = async () => {
    const track = await spotifyApi.getMyCurrentPlayingTrack();
    // console.log("track", JSON.stringify(track));
    if (track?.body?.item) {
        let artists = track.body.item.artists.map(artist => artist.name);
        if (artists.length > 1) {
            artists = artists.join(", ");
            const lastComma = artists.lastIndexOf(", ");
            artists = artists.substring(0, lastComma) + " &" + artists.substring(lastComma + 1);
        } else {
            artists = artists[0];
        }
        
        return {
            name: track.body.item.name,
            artists,
            album: track.body.item.album.name,
            image: track.body.item.album.images[0].url,
            trackLink: track.body.item.external_urls.spotify,
        };   
    }
    return undefined;
}

const sendEmail = async (currentTrack) => {
    try {
        const info = await transporter.sendMail({
            from: EMAIL_USER,
            to: TARGET_EMAIL_USER,
            subject: "New Spotify Track",
            text: `Currently listening to: ${currentTrack.name} by ${currentTrack.artists} from the album ${currentTrack.album}`,
        });
        console.log("Message sent: ", info.messageId);
    } catch (err) {
        console.error("Error sending email: ", err);
    }
}

// MAIN
(async () => {
    let currentTrack;

    console.log(`This process is pid ${process.pid}`); 
    
    authorize();

    const code = await input({ message: "Enter code from browser" });

    console.log("\n\nYou entered: ", code);

    await codeGrant(code);

    setInterval(refreshToken, 50 * 60 * 1000); // refresh every 50 minutes

    currentTrack = await getCurrentTrack();
    console.log("currentTrack", currentTrack);
    if (currentTrack) {
        sendEmail(currentTrack);
    }
    setInterval(async () => {
        const newTrack = await getCurrentTrack();
        if (newTrack && currentTrack?.name !== newTrack.name && currentTrack?.artists !== newTrack.artists && currentTrack?.album !== newTrack.album) {
            currentTrack = newTrack;
            console.log("currentTrack", currentTrack);
            sendEmail(currentTrack);
        }
    }, 2 * 60 * 1000); // poll every 2 minutes
})();