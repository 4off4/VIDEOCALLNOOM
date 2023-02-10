const socket = io();

const myFace = document.getElementById("myFace");
const muteBtn = document.getElementById("mute");
const cameraBtn = document.getElementById("camera");
const camerasSelect = document.getElementById("cameras");
const call  = document.getElementById("call");

call.hidden = true;

let myStream; 
let muted = false;
let cameraOff = false;
let roomName;
let myPeerConnection; 
let myDataChannel;

async function getCameras() {
    try{
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((device) => device.kind === "videoinput");
        const currentCamera = myStream.getVideoTracks()[0];
        cameras.forEach(camera => {
            const option = document.createElement("option");
            option.value = camera.deviceId;
            if(currentCamera.label == camera.label){
                option.selected = true;
                option.innerText = "√ " + camera.label;
            }else{
                option.innerText = camera.label;
            }
            camerasSelect.appendChild(option);
        });
    }catch(e){
        console.log(e);
    }
}

async function getMedia(deviceId) {
    // deviceId가 없을 때 
    const initialConstrains = {
        audio: true,
        video: {facingMode: "user"}
    };
     // deviceId가 있을 때
    const cameraConstrains = {
        audio: true,
        video: {deviceId:{exact: deviceId}}
    };
    try{
        myStream = await navigator.mediaDevices.getUserMedia(
            deviceId? cameraConstrains: initialConstrains
        );
        myFace.srcObject = myStream;
        if(!deviceId){
            await getCameras();
        }
    } catch(e){
        console.log(e);
    }
}

function handleMuteClick() {
    myStream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));

    if(!muted){
        muteBtn.innerText = "Unmute";
        muted = true;
    }else{
        muteBtn.innerText = "Mute";
        muted = false;
    }
}
function handleCameraClick() {
    myStream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));

    if(cameraOff){
        cameraBtn.innerText = "Camera Off";
        cameraOff = false;
    }else{
        cameraBtn.innerText = "Camera On";
        cameraOff = true;
    }
}

async function handleCameraChange() {
    await getMedia(camerasSelect.value);
    if(myPeerConnection){
        const videoTrack = myStream.getVideoTracks()[0];
        const videoSender = myPeerConnection.getSenders().find(sender => sender.track.kind == "video");
        
        // 다른 브라우저에 나의 비디오를 보내기
        videoSender.replaceTrack(videoTrack);
    }
}

muteBtn.addEventListener("click", handleMuteClick);
cameraBtn.addEventListener("click", handleCameraClick);
camerasSelect.addEventListener("input", handleCameraChange);


// Welcome form (방 선택)
const welcome = document.getElementById("welcome"); 
const welcomeForm = welcome.querySelector("form");

async function initCall() {
    welcome.hidden = true;
    call.hidden = false;
    await getMedia();
    makeConnection();
}

async function handleWelcomeSubmit(event){
    event.preventDefault();
    const input = welcomeForm.querySelector("input");
    const inputV = input.value.toString('utf8');

    console.log(inputV);

    // 특수문자 
    const regExp = /[\{\}\[\]\/?.,;:|\)*~`!^\-_+<>@\#$%&\\\=\(\'\"]/g;
    
    if(regExp.test(inputV)) {
        alert("Special characters are not allowed!");
        input.value = "";
    }else if(inputV.length <= 1 || inputV.length > 10){
        alert("The room name is at least 2 to 10 characters long!");
    }
    else{
        await initCall();
        socket.emit("join_room", inputV);
        roomName = inputV;
        input.value = "";
    }

}
welcomeForm.addEventListener("submit", handleWelcomeSubmit);


/* Socekt 코드 */ 
// 해당 코드는 peer A에서 실행 
socket.on("welcome", async () => {
    // DataChannel
    myDataChannel = myPeerConnection.createDataChannel("chat");
    myDataChannel.addEventListener("message", (event) => console.log(event.data));
    console.log("made data channel!");

    const offer = await myPeerConnection.createOffer();
    myPeerConnection.setLocalDescription(offer);
    console.log("Sent the offer");
    socket.emit("offer", offer, roomName);
});

// 해당 코드는 peer B에서 실행 
socket.on("offer", async(offer) => {
    myPeerConnection.addEventListener("datachannel", (event) => {
        myDataChannel = event.channel;
        myDataChannel.addEventListener("message", (event) => console.log(event.data));
    });

    myPeerConnection.setRemoteDescription(offer);
    const answer = await myPeerConnection.createAnswer();
    myPeerConnection.setLocalDescription(answer);
    socket.emit("answer", answer, roomName);
});

socket.on("answer", (answer) => {
    console.log("received the answer");
    myPeerConnection.setRemoteDescription(answer);
});

socket.on("ice", (ice) => {
    console.log("received candidate");
    myPeerConnection.addIceCandidate(ice);
  });

// RTC 코드 
function makeConnection(){                     
    myPeerConnection = new RTCPeerConnection({
        iceServers: [
            {
                urls: [
                    "stun:stun.l.google.com:19302",
                    "stun:stun1.l.google.com:19302",
                    "stun:stun2.l.google.com:19302",
                    "stun:stun3.l.google.com:19302",
                    "stun:stun4.l.google.com:19302",
                ],
            },
        ],
    });
    myPeerConnection.addEventListener("icecandidate", handleIce);
    myPeerConnection.addEventListener("addstream", handleAddStream);
    //myPeerConnection.addEventListener("track", handleTrack); // 모바일-핸드폰 연결 사용 - #3.9수업 댓글 확인

    // peer-to-peer 연결 
    myStream.getTracks().forEach((track) => myPeerConnection.addTrack(track, myStream));
    // addTrack: track들을 개별적으로 추가해주는 함수 
}

// 모바일-핸드폰 연결 사용 - #3.9수업 댓글 확인
/*
function handleTrack(data) {
    console.log("handle track");
    const peerFace = document.querySelector("#peerFace");
    peerFace.srcObject = data.streams[0];
}*/

function handleIce(data) {
    console.log("sent candidate");
    socket.emit("ice", data.candidate, roomName);
}
  
function handleAddStream(data) {
    const peerFace = document.getElementById("peerFace");
    peerFace.srcObject = data.stream;
}
