#!/php -q
<?php
// Run from command prompt > php myDemo3.php
require_once("websocket.server.php");

class DemoSocketServer implements IWebSocketServerObserver {

    protected $debug = true;
    protected $server;
    
    protected $users=array();

    public function __construct() {
        $this->server = new WebSocketServer("tcp://0.0.0.0:12345", 'keysecretdupersuper');
        $this->server->addObserver($this);
    }

    public function onConnect(IWebSocketConnection $user) {
        $this->say("[DEMO] {$user->getId()} connected");
        
        global $users;
        $users[count($users)]=$user;        
        echo "connected users: ".count($users)."\n";
    }

    public function onMessage(IWebSocketConnection $user, IWebSocketMessage $msg)
    {
        global $users,$n;
        
		$data=json_decode($msg->getData());
		$data->uid=$user->getID();
		$msg->setData(json_encode($data));
		foreach ($users as $i)
		{
			if($i==$user)
				continue;
			$i->sendMessage($msg);
		}
    }

    public function onDisconnect(IWebSocketConnection $user) {
        $this->say("[DEMO] {$user->getId()} disconnected");
        
        global $users;
		$id=$user->getID();
		$key=array_search($user,$users,TRUE);
        unset($users[$key]);
        echo "connected users: ".count($users)."\n";

		$msg = WebSocketMessage::create('{"type":"disconnect","uid":"'.$id.'"}');
		foreach ($users as $i)
			$i->sendMessage($msg);
	}

    public function onAdminMessage(IWebSocketConnection $user, IWebSocketMessage $msg) {
        $frame = WebSocketFrame::create(WebSocketOpcode::PongFrame);
        $user->sendFrame($frame);
    }

    public function say($msg) {
        echo "$msg. \r\n";
    }

    public function run() {
        $this->server->run();
    }

}

// Start server
$server = new DemoSocketServer();
$server->run();