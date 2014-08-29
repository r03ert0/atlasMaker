var sum=new Array();
var	view='sag';
var brain_offcn=document.createElement('canvas');
var brain_offtx=brain_offcn.getContext('2d');
var canvas = document.getElementById('brainCanvas');
var context = canvas.getContext('2d');
var brain_px;
var	brain_W,brain_H;
var	brain_Wdim,brain_Hdim;
var	max=0;
var	brain_dim=new Array(3); // [LR,PA,IS]=[180,216,180];
var brain_pixdim=new Array(3);
var	brain_datatype;
var	slice=50;
var	brain=0;
var	brain_min,brain_max;
var name;

function init_stereotaxic(theName,progress)
{
	name=theName;
	loadBrain(progress);
}
function changeView(theView)
{
	switch(theView)
	{
		case 'sagittal':
			view='sag';
			break;
		case 'coronal':
			view='cor';
			break;
		case 'axial':
			view='axi';
			break;
	}
	if(brain)
		configureBrainImage();
	drawImages();
}
function changeSlice(e,u)
{
	slice=$("#slider").slider("value");
	drawImages();
}

function configureBrainImage()
{
	// init query image
	switch(view)
	{	case 'sag':	brain_W=brain_dim[1]/*PA*/; brain_H=brain_dim[2]/*IS*/; brain_Wdim=brain_pixdim[1]; brain_Hdim=brain_pixdim[2]; break; // sagital
		case 'cor':	brain_W=brain_dim[0]/*LR*/; brain_H=brain_dim[2]/*IS*/; brain_Wdim=brain_pixdim[0]; brain_Hdim=brain_pixdim[2]; break; // coronal
		case 'axi':	brain_W=brain_dim[0]/*LR*/; brain_H=brain_dim[1]/*PA*/; brain_Wdim=brain_pixdim[0]; brain_Hdim=brain_pixdim[1]; break; // axial
	}
	brain_offcn.width=brain_W;
	brain_offcn.height=brain_H;
	canvas.width=brain_W;
	canvas.height=brain_H;
	brain_px=brain_offtx.getImageData(0,0,brain_offcn.width,brain_offcn.height);

	var W=parseFloat($('#resizable').css('width'));
	$('#resizable').css('height', (brain_H*brain_Hdim)*W/(brain_W*brain_Wdim) );
}
function drawImages()
{
	context.clearRect(0,0,context.canvas.width,canvas.height);
	
	// draw brain
	if(brain)
		drawBrainImage();
	else
	{
		var img = new Image();
  		img.src = "data/"+name+"/"+view+".jpg";
  		img.onload = function(){
			var W=parseFloat($('#resizable').css('width'));
			var	w=this.width;
			var	h=this.height;
			console.log("W:",W,"w:",w,"h:",h);
			$('#resizable').css('height', h*W/w );
			canvas.width=W;
			canvas.height=h*W/w;
  			context.drawImage(this,0,0,W,h*W/w);
  		};
	}
}
function drawBrainImage()
{
	if(brain==0)
		return;

	ys=Math.floor(brain_dim[0]/*LR*/*slice/100);
	yc=Math.floor(brain_dim[1]/*PA*/*slice/100);
	ya=Math.floor(brain_dim[2]/*IS*/*slice/100);
	for(y=0;y<brain_H;y++)
	for(x=0;x<brain_W;x++)
	{
		switch(view)
		{	case 'sag':i= y*brain_dim[1]/*PA*/*brain_dim[0]/*LR*/+ x*brain_dim[0]/*LR*/+ys; break;
			case 'cor':i= y*brain_dim[1]/*PA*/*brain_dim[0]/*LR*/+yc*brain_dim[0]/*LR*/+x; break;
			case 'axi':i=ya*brain_dim[1]/*PA*/*brain_dim[0]/*LR*/+ y*brain_dim[0]/*LR*/+x; break;
		}
		val=255*(brain[i]-brain_min)/(brain_max-brain_min);
//		i=((brain_H-y-1)*brain_offcn.width+x)*4;
		i=(y*brain_offcn.width+x)*4;
		brain_px.data[ i ]  =val;
		brain_px.data[ i+1 ]=val;
		brain_px.data[ i+2 ]=val;
		brain_px.data[ i+3 ]=255;
	}
	brain_offtx.putImageData(brain_px, 0, 0);

	context.drawImage(brain_offcn,0,0,brain_W,brain_H);
}
function loadBrain(progress)
{
	var oReq = new XMLHttpRequest();
	oReq.open("GET", "data/"+name+"/MRI-n4.nii.gz", true);
	oReq.addEventListener("progress", function(e){progress.html("Loading MRI ("+parseInt(100*e.loaded/e.total)+"%)")}, false);
	//progress.html("<span id='loader'><div class='dot'></div></span> Loading MRI "+parseInt(100*e.loaded/e.total)+"%");
	oReq.responseType = "arraybuffer";
	oReq.onload = function(oEvent)
	{
		var prog=new Object();
		prog.drawProgress=function(pct){progress.html("Uncompressing MRI ("+parseInt(100*pct)+"%)")};
		var gunzip = new Gunzip(prog);
        gunzip.gunzip(this.response,function(data){
        	//vol.finishedDecompress(vol, data);
			var	dv=new DataView(data);//this.response);
			var	sizeof_hdr=dv.getInt32(0,true);
			var	dimensions=dv.getInt16(40,true);
			brain_dim[0]=dv.getInt16(42,true);
			brain_dim[1]=dv.getInt16(44,true);
			brain_dim[2]=dv.getInt16(46,true);
			brain_datatype=dv.getInt16(72,true);
			brain_pixdim[0]=dv.getFloat32(80,true);
			brain_pixdim[1]=dv.getFloat32(84,true);
			brain_pixdim[2]=dv.getFloat32(88,true);
			var	vox_offset=dv.getFloat32(108,true);
		
			switch(brain_datatype)
			{
				case 8:
					brain=new Uint8Array(data,vox_offset);
					break;
				case 16:
					brain=new Int16Array(data,vox_offset);
					break;
				case 32:
					brain=new Float32Array(data,vox_offset);
					break;
			}
		
			var s,ss,std,tmpmin,tmpmax;
			s=ss=0;
			brain_min=brain_max=brain[0];
			for(i=0;i<brain.length;i++)
			{
				if(brain[i]<brain_min)
					brain_min=brain[i];
				if(brain[i]>brain_max)
					brain_max=brain[i];
				s+=brain[i];
				ss+=brain[i]*brain[i];
			}
			s=s/brain.length;
			std=Math.sqrt(ss/brain.length-s*s);
			tmpmin=s-2*std;
			tmpmax=s+2*std;
			brain_min=(tmpmin<brain_min)?brain_min:tmpmin;
			brain_max=(tmpmax>brain_max)?brain_max:tmpmax;
		
			console.log("dim",brain_dim[0],brain_dim[1],brain_dim[2]);
			console.log("datatype",brain_datatype);
			console.log("pixdim",brain_pixdim[0],brain_pixdim[1],brain_pixdim[2]);
			console.log("vox_offset",vox_offset);
			/*
				 0		int   sizeof_hdr;    //!< MUST be 348           //  // int sizeof_hdr;      //
				 4		char  data_type[10]; //!< ++UNUSED++            //  // char data_type[10];  //
				 14		char  db_name[18];   //!< ++UNUSED++            //  // char db_name[18];    //
				 32		int   extents;       //!< ++UNUSED++            //  // int extents;         //
				 36		short session_error; //!< ++UNUSED++            //  // short session_error; //
				 38		char  regular;       //!< ++UNUSED++            //  // char regular;        //
				 39		char  dim_info;      //!< MRI slice ordering.   //  // char hkey_un0;       //

													  //--- was image_dimension substruct ---//
				 40		short dim[8];        //!< Data array dimensions.//  // short dim[8];        //
				 56		float intent_p1 ;    //!< 1st intent parameter. //  // short unused8;       //
																	 // short unused9;       //
				 60		float intent_p2 ;    //!< 2nd intent parameter. //  // short unused10;      //
																	 // short unused11;      //
				 64		float intent_p3 ;    //!< 3rd intent parameter. //  // short unused12;      //
																	 // short unused13;      //
				 68		short intent_code ;  //!< NIFTI_INTENT_* code.  //  // short unused14;      //
				 72		short datatype;      //!< Defines data type!    //  // short datatype;      //
				 74		short bitpix;        //!< Number bits/voxel.    //  // short bitpix;        //
				 76		short slice_start;   //!< First slice index.    //  // short dim_un0;       //
				 78		float pixdim[8];     //!< Grid spacings.        //  // float pixdim[8];     //
				 110	float vox_offset;    //!< Offset into .nii file //  // float vox_offset;    //
				 float scl_slope ;    //!< Data scaling: slope.  //  // float funused1;      //
				 float scl_inter ;    //!< Data scaling: offset. //  // float funused2;      //
				 short slice_end;     //!< Last slice index.     //  // float funused3;      //
				 char  slice_code ;   //!< Slice timing order.   //
				 char  xyzt_units ;   //!< Units of pixdim[1..4] //
				 float cal_max;       //!< Max display intensity //  // float cal_max;       //
				 float cal_min;       //!< Min display intensity //  // float cal_min;       //
				 float slice_duration;//!< Time for 1 slice.     //  // float compressed;    //
				 float toffset;       //!< Time axis shift.      //  // float verified;      //
				 int   glmax;         //!< ++UNUSED++            //  // int glmax;           //
				 int   glmin;         //!< ++UNUSED++            //  // int glmin;           //
			*/
			configureBrainImage();
			progress.html("<a class='download' href='/data/"+name+"/MRI-n4.nii.gz'><img src='download.svg' style='vertical-align:middle;margin-bottom:5px'/></a>MRI");
			drawImages();
        });

        //if (gunzip.hasError()) {

	};
	oReq.send();

	console.log("[loadBrain] brain started loading");
	drawImages();
}