@bury(expiry="2024-12-01", reason="old view")
class OldView:
    def get(self):
        pass

@bury(expiry="2023-01-01", reason="old func")
def old_util():
    pass
