/*
	Atlas Maker Server
	Roberto Toro, 25 July 2014
	
	Launch using > node atlasMakerServer.js
*/

var WebSocketServer=require("ws").Server;
var fs=require("fs");
var zlib=require("zlib");

var	debug=0;
var	Atlases=[];
var	Users=[];
var	usrsckts=[];
//var	localhost="/var/www/html";
var	localhost="/Library/WebServer/Documents/";
var	uidcounter=1;

initSocketConnection();

//========================================================================================
// Web socket
//========================================================================================
function getUserId(socket) {
	for(var i in usrsckts) {
		if(socket==usrsckts[i].socket)
			return usrsckts[i].uid;
	}
	return -1;
}
function removeUser(socket) {
	for(var i in usrsckts) {
		if(socket==usrsckts[i].socket)
		{
			usrsckts.splice(i,1);
			break;
		}
	}
}
function initSocketConnection() {
	// WS connection
	var host = "ws://localhost:12345/echo";
	
	if(debug)
		console.log("[initSocketConnection] host:",host);
	
	try
	{
		socket = new WebSocketServer({port:12345});
		socket.on("connection",function(s)
		{
			if(debug)
				console.log("[connection]");

			var	usr={"uid":uidcounter++,"socket":s};
			usrsckts.push(usr);
			if(debug)
				console.log("user",usr.uid,"connected, total:",usrsckts.length,"users");
			s.on('message',function(msg)
			{
				console.log("[connection: message]");
				var uid=getUserId(this);
				var	data=JSON.parse(msg);
				data.uid=uid;
				msg=JSON.stringify(data);
				if(debug)
					console.log("UID:",data.uid);
				
				// broadcast
				for(var i in socket.clients)
				{
					var uid=getUserId(socket.clients[i]);
					if(data.uid==uid)
						continue;
					socket.clients[i].send(msg);
				}

				// integrate paint messages
				switch(data.type)
				{
					case "intro":
						receiveUserDataMessage(this,data);
						break;
					case "paint":
						receivePaintMessage(this,data);
						break;
				}
			});
			
			s.on('close',function(msg)
			{
				console.log("[connection: close]");
				console.log("usrsckts length",usrsckts.length);
				for(var i in usrsckts)
					if(usrsckts[i].socket==s)
						console.log("user",usrsckts[i].uid,"is closing connection\n\n");
				var uid=getUserId(this);
				var u=uid;	// user
				Users[u]=undefined;
				removeUser(this);
				// display the total number of connected users
				var	nusers=Users.filter(function(value){ return value !== undefined }).length;
				if(debug)
				{
					console.log("user",u,"closed connection");
					console.log(nusers+" connected");
				}
			});
		});
	}
	catch (ex)
	{
		console.log("ERROR: Unable to create a server");
	}
}
function receivePaintMessage(ws,data) {
	if(debug)
		console.log("[receivePaintMessage]");

	var	msg=JSON.parse(data.data);
	var u=parseInt(data.uid);	// user
	var c=msg.c;				// command
	var x=parseInt(msg.x);		// x coordinate
	var y=parseInt(msg.y);		// y coordinate
	var	vol=Atlases[0].data;
	
	paintxy(u,c,x,y,Users[u],vol);
}
function receiveUserDataMessage(ws,data)
{
	if(debug)
		console.log("[receiveUserDataMessage]");
	var u=data.uid;
	var user=JSON.parse(data.user);
	var	i,atlasLoadedFlag,firstConnectionFlag;
	
	firstConnectionFlag=(Users[u]==undefined);

	atlasLoadedFlag=false;
	for(i=0;i<Atlases.length;i++)
		if(Atlases[i].dirname==user.dirname && Atlases[i].name==user.mri.atlas)
		{
			atlasLoadedFlag=true;
			break;
		}
	
	if(atlasLoadedFlag)
	{
		if(firstConnectionFlag)
			// send the new user our data
			sendAtlasToUser(Atlases[0].data,ws);
	}
	else
		// load the atlas she's requesting
		addAtlas(user.dirname,user.mri.atlas,function(atlas){sendAtlasToUser(atlas,ws)});
	
	// Update user data
	Users[u]=user;
}
function sendAtlasToUser(atlasdata,ws)
{
	if(debug)
		console.log("[sendAtlasToUser]");
	zlib.gzip(atlasdata,function(err,atlasdatagz) {
		ws.send(atlasdatagz, {binary: true, mask: false});
	});
}
//========================================================================================
// Load & Save
//========================================================================================
function addAtlas(dirname,atlasname,callback)
{
	if(debug)
		console.log("[add atlas]");
	
	var atlas=new Object();

	atlas.name=atlasname;
	atlas.dirname=dirname;
	loadNifti(atlas,callback);	
	Atlases.push(atlas);
	
	setInterval(function(){saveNifti(atlas)},10*60*1000);
}
function loadNifti(atlas,callback)
{
	// Load nifty label
	var niigz=fs.readFileSync(localhost+"/"+atlas.dirname+"/"+atlas.name);

	zlib.gunzip(niigz,function(err,nii) {
		var	sizeof_hdr=nii.readUInt32LE(0);
		var	dimensions=nii.readUInt16LE(40);
		atlas.hdr=nii.slice(0,vox_offset);
		atlas.dim=[];
		atlas.dim[0]=nii.readUInt16LE(42);
		atlas.dim[1]=nii.readUInt16LE(44);
		atlas.dim[2]=nii.readUInt16LE(46);
		var datatype=nii.readUInt16LE(72);
		var	vox_offset=nii.readFloatLE(108);
	
		atlas.data=nii.slice(vox_offset);
	
		var i,sum=0;
		for(i=0;i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2];i++)
			sum+=atlas.data[i];
		atlas.sum=sum;

		console.log("size",atlas.data.length);
		console.log("dim",atlas.dim);
		console.log("datatype",datatype);
		console.log("vox_offset",vox_offset);
		
		callback(atlas.data);
	});
}
function saveNifti(atlas)
{
	if(atlas && atlas.dim)
	{
		var i,sum=0;
		for(i=0;i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2];i++)
			sum+=atlas.data[i];
		if(sum==atlas.sum)
		{
			console.log("no change, no save");
			return;
		}
		atlas.sum=sum;

		var	voxel_offset=352;
		var	nii=new Buffer(atlas.dim[0]*atlas.dim[1]*atlas.dim[2]+voxel_offset);
		console.log("data length",atlas.data.length+voxel_offset,"buff length",nii.length);
		atlas.hdr.copy(nii);
		atlas.data.copy(nii,voxel_offset);
		zlib.gzip(nii,function(err,niigz) {
			var	ms=+new Date;
			var n1=localhost+atlas.dirname+atlas.name;
			var	n2=localhost+atlas.dirname+ms+"_"+atlas.name;
			fs.rename(n1,n2,function(){
				fs.writeFile(n1,niigz);
			});
		});
	}
	else
		console.log("nope");
}

//========================================================================================
// Painting
//========================================================================================
function paintxy(u,c,x,y,user,vol)
{
	var	coord=xyz2slice(x,y,user.slice,user.view);
	if(user.x0<0) {
		user.x0=coord.x;
		user.y0=coord.y;
	}
	
	switch(c)
	{
		case 'le':
			line(coord.x,coord.y,0,user,vol,user.dim);
			break;
		case 'lf':
			line(coord.x,coord.y,1,user,vol,user.dim);
			break;
		case 'f':
			fill(coord.x,coord.y,coord.z,1,user.view,vol,user.dim);
			break;
		case 'e':
			fill(coord.x,coord.y,coord.z,0,user.view,vol,user.dim);
			break;
	}
	user.x0=coord.x;
	user.y0=coord.y;
}
function fill(x,y,z,val,view,vol,dim)
{
	var	Q=[],n;
	var	i;
		
	Q.push({"x":x,"y":y});
	while(Q.length>0)
	{
		n=Q.pop();
		x=n.x;
		y=n.y;
		if(vol[slice2index(x,y,z,view)]!=val)
		{
			i=slice2index(x,y,z,view);
			vol[i]=val;
			
			i=slice2index(x-1,y,z,view);
			if(i>=0 && vol[i]!=val)
				Q.push({"x":x-1,"y":y});
			
			i=slice2index(x+1,y,z,view);
			if(i>=0 && vol[i]!=val)
				Q.push({"x":x+1,"y":y});
			
			i=slice2index(x,y-1,z,view);
			if(i>=0 && vol[i]!=val)
				Q.push({"x":x,"y":y-1});
			
			i=slice2index(x,y+1,z,view);
			if(i>=0 && vol[i]!=val)
				Q.push({"x":x,"y":y+1});
		}
	}
}
function line(x,y,val,user,vol,dim)
{
	// Bresenham's line algorithm adapted from
	// http://stackoverflow.com/questions/4672279/bresenham-algorithm-in-javascript

	var	i;
	var	x1=user.x0;
	var y1=user.y0;
	var x2=x;
	var y2=y;
	var	z=user.slice;

    // Define differences and error check
    var dx = Math.abs(x2 - x1);
    var dy = Math.abs(y2 - y1);
    var sx = (x1 < x2) ? 1 : -1;
    var sy = (y1 < y2) ? 1 : -1;
    var err = dx - dy;

    i=slice2index(x1,y1,z,user.view);
    vol[i]=val;
    
	while (!((x1 == x2) && (y1 == y2)))
	{
		var e2 = err << 1;
		if (e2 > -dy)
		{
			err -= dy;
			x1 += sx;
		}
		if (e2 < dx)
		{
			err += dx;
			y1 += sy;
		}
		for(j=0;j<user.penSize;j++)
		for(k=0;k<user.penSize;k++)
		{
			i=slice2index(x1+j,y1+k,z,user.view);
			vol[i]=val;
		}
	}
}
function slice2index(mx,my,mz,myView)
{
	var	layer=Atlases[0];
	var	dim=layer.dim;
	var	x,y,z;
	var	i=-1;
	switch(myView)
	{	case 'sag':	x=mz; y=mx; z=my;break; // sagital
		case 'cor':	x=mx; y=mz; z=my;break; // coronal
		case 'axi':	x=mx; y=my; z=mz;break; // axial
	}	
	if(z>=0&&z<dim[2]&&y>=0&&y<dim[1]&&x>=0&&x<dim[0])
		i=z*dim[1]*dim[0]+y*dim[0]+x;
	return i;
}
function xyz2slice(x,y,z,myView)
{
	var	mx,my,mz;
	switch(myView)
	{	case 'sag':	mz=x; mx=y; my=z;break; // sagital
		case 'cor':	mx=x; mz=y; my=z;break; // coronal
		case 'axi':	mx=x; my=y; mz=z;break; // axial
	}	
	return new Object({"x":x,"y":y,"z":z});	
}

